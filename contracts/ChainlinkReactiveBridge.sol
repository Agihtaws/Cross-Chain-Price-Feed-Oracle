// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./lib/AbstractReactive.sol";
import "./interfaces/AggregatorV3Interface.sol";

contract ChainlinkReactiveBridge is AbstractReactive {
    
    event PriceUpdateDetected(
        address indexed aggregatorAddress,
        uint256 indexed roundId,
        int256 indexed answer,
        uint256 updatedAt
    );

    event CallbackEmitted(
        uint256 indexed chainId,
        address indexed destination,
        address indexed aggregatorAddress,
        uint256 roundId
    );

    uint256 private constant ANSWER_UPDATED_TOPIC_0 = 0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f;
    uint64 private constant CALLBACK_GAS_LIMIT = 1000000;

    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    uint256 public immutable reactiveNetworkChainId;

    mapping(address => address) public aggregatorToFeedProxy;
    mapping(address => uint8) public aggregatorDecimals;
    mapping(address => string) public aggregatorDescriptions;
    
    address[] public monitoredAggregators;

    mapping(address => uint256) public lastUpdateTimestampForAggregator;
    mapping(address => int256) public lastAnswerForAggregator;
    mapping(address => uint256) public updateCountForAggregator;

    function monitoredAggregatorsLength() public view returns (uint256) {
        return monitoredAggregators.length;
    }

    constructor(
        uint256 _originChainId,
        uint256 _destinationChainId,
        uint256 _reactiveNetworkChainId,
        address[] memory _chainlinkAggregatorAddresses,
        address[] memory _feedProxyAddresses,
        uint8[] memory _decimals,
        string[] memory _descriptions
    ) AbstractReactive() payable {
        require(_chainlinkAggregatorAddresses.length == _feedProxyAddresses.length, "Aggregators and proxies mismatch");
        require(_chainlinkAggregatorAddresses.length == _decimals.length, "Aggregators and decimals mismatch");
        require(_chainlinkAggregatorAddresses.length == _descriptions.length, "Aggregators and descriptions mismatch");
        require(_chainlinkAggregatorAddresses.length > 0, "No aggregators provided");
        
        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        reactiveNetworkChainId = _reactiveNetworkChainId;

        for (uint i = 0; i < _chainlinkAggregatorAddresses.length; i++) {
            address currentAggregatorAddress = _chainlinkAggregatorAddresses[i];
            address currentFeedProxyAddress = _feedProxyAddresses[i];
            uint8 currentDecimals = _decimals[i];
            string memory currentDescription = _descriptions[i];

            require(currentAggregatorAddress != address(0), "Invalid aggregator address in array");
            require(currentFeedProxyAddress != address(0), "Invalid feed proxy address in array");
            require(currentDecimals > 0, "Invalid decimals in array");
            require(bytes(currentDescription).length > 0, "Invalid description in array");

            aggregatorToFeedProxy[currentAggregatorAddress] = currentFeedProxyAddress;
            aggregatorDecimals[currentAggregatorAddress] = currentDecimals;
            aggregatorDescriptions[currentAggregatorAddress] = currentDescription;
            monitoredAggregators.push(currentAggregatorAddress);

            if (!vm) {
                service.subscribe(
                    _originChainId,
                    currentAggregatorAddress,
                    ANSWER_UPDATED_TOPIC_0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
        }
    }

    function updateBridgeInternalState(
        address _rvmId,
        address _aggregatorAddress,
        uint256 _updatedAt,
        int256 _answer,
        uint256 _roundId
    ) external rvmIdOnly(_rvmId) {
        require(_aggregatorAddress != address(0), "Invalid aggregator address for state update");
        require(aggregatorToFeedProxy[_aggregatorAddress] != address(0), "Unmonitored aggregator for state update");

        if (_updatedAt > lastUpdateTimestampForAggregator[_aggregatorAddress]) {
            lastUpdateTimestampForAggregator[_aggregatorAddress] = _updatedAt;
            lastAnswerForAggregator[_aggregatorAddress] = _answer;
            updateCountForAggregator[_aggregatorAddress]++;
        }
    }

    function react(LogRecord calldata log) external override vmOnly {
        require(log.topic_0 == ANSWER_UPDATED_TOPIC_0, "Unsupported event topic");

        address currentAggregatorAddress = log._contract;
        require(aggregatorToFeedProxy[currentAggregatorAddress] != address(0), "Event from unmonitored aggregator");

        int256 current = int256(log.topic_1);
        uint256 roundId = log.topic_2;
        uint256 updatedAt = abi.decode(log.data, (uint256));

        require(current > 0, "Invalid price");
        require(updatedAt > 0, "Invalid timestamp");
        require(updatedAt <= block.timestamp + 60, "Future timestamp");
        
        uint256 lastTs = lastUpdateTimestampForAggregator[currentAggregatorAddress];
        require(updatedAt > lastTs, "Stale update");

        emit PriceUpdateDetected(currentAggregatorAddress, roundId, current, updatedAt);

        uint80 fullRoundId = uint80(roundId);
        uint256 startedAt = updatedAt;
        uint80 answeredInRound = uint80(roundId);

        bytes memory payloadToFeedProxy = abi.encodeWithSignature(
            "updatePrice(address,uint80,int256,uint256,uint256,uint80)",
            address(0),
            fullRoundId,
            current,
            startedAt,
            updatedAt,
            answeredInRound
        );

        emit Callback(destinationChainId, aggregatorToFeedProxy[currentAggregatorAddress], CALLBACK_GAS_LIMIT, payloadToFeedProxy);
        emit CallbackEmitted(destinationChainId, aggregatorToFeedProxy[currentAggregatorAddress], currentAggregatorAddress, roundId);

        bytes memory selfPayload = abi.encodeWithSignature(
            "updateBridgeInternalState(address,address,uint256,int256,uint256)",
            address(0),
            currentAggregatorAddress,
            updatedAt,
            current,
            roundId
        );
        emit Callback(reactiveNetworkChainId, address(this), CALLBACK_GAS_LIMIT, selfPayload);
    }
}

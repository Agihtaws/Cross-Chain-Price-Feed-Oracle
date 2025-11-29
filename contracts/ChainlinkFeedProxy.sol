// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./lib/AbstractCallback.sol";
import "./interfaces/IChainlinkFeedProxyExtended.sol";

contract ChainlinkFeedProxy is AbstractCallback, IChainlinkFeedProxyExtended {
    
    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    event NewRound(
        uint256 indexed roundId,
        address indexed startedBy,
        uint256 startedAt
    );

    address public immutable sourceAggregator;
    uint8 public immutable override decimals;
    string public override description;
    uint256 public constant override version = 1;

    RoundData private latestRound;
    mapping(uint80 => RoundData) private rounds;

    uint256 public immutable override maxHistory;

    uint80 private oldestRoundId;

    constructor(
        address _callbackSender,
        address _sourceAggregator,
        uint8 _decimals,
        string memory _description,
        uint256 _maxHistory
    ) AbstractCallback(_callbackSender) payable {
        require(_sourceAggregator != address(0), "Invalid source aggregator");
        require(_decimals > 0, "Invalid decimals");
        require(_maxHistory > 0, "Max history must be greater than zero");
        
        sourceAggregator = _sourceAggregator;
        decimals = _decimals;
        description = _description;
        maxHistory = _maxHistory;
    }

    function updatePrice(
        address sender,
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external authorizedSenderOnly rvmIdOnly(sender) {
        require(_answer > 0, "Invalid answer");
        require(_updatedAt > 0, "Invalid timestamp");
        require(_updatedAt <= block.timestamp + 60, "Future timestamp");
        require(_roundId > latestRound.roundId, "Stale round");

        RoundData memory newRound = RoundData({
            roundId: _roundId,
            answer: _answer,
            startedAt: _startedAt,
            updatedAt: _updatedAt,
            answeredInRound: _answeredInRound
        });

        latestRound = newRound;
        rounds[_roundId] = newRound;

        if (oldestRoundId == 0) {
            oldestRoundId = _roundId;
        }

        while (_roundId - oldestRoundId >= maxHistory) { 
            delete rounds[oldestRoundId];
            oldestRoundId++;
        }

        emit AnswerUpdated(_answer, _roundId, _updatedAt);
        emit NewRound(_roundId, sender, _startedAt);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(latestRound.roundId > 0, "No data present");
        
        return (
            latestRound.roundId,
            latestRound.answer,
            latestRound.startedAt,
            latestRound.updatedAt,
            latestRound.answeredInRound
        );
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory round = rounds[_roundId];
        require(round.roundId == _roundId, "Round data not available"); 
        
        return (
            round.roundId,
            round.answer,
            round.startedAt,
            round.updatedAt,
            round.answeredInRound
        );
    }

    function getRoundDataBetween(
        uint80 _fromRoundId,
        uint80 _toRoundId
    ) external view override returns (RoundData[] memory) {
        require(_fromRoundId > 0 && _toRoundId >= _fromRoundId, "Invalid round ID range");
        require(latestRound.roundId > 0, "No data present in oracle");

        uint80 actualFromRound = _fromRoundId;
        if (oldestRoundId > 0 && actualFromRound < oldestRoundId) {
            actualFromRound = oldestRoundId;
        }
        
        uint80 actualToRound = _toRoundId;
        if (actualToRound > latestRound.roundId) {
            actualToRound = latestRound.roundId;
        }

        uint256 count = 0;
        for (uint80 i = actualFromRound; i <= actualToRound; i++) {
            if (rounds[i].roundId == i) { 
                count++;
            }
        }

        RoundData[] memory result = new RoundData[](count);
        uint256 resultIndex = 0;
        for (uint80 i = actualFromRound; i <= actualToRound; i++) {
            if (rounds[i].roundId == i) { 
                result[resultIndex] = rounds[i];
                resultIndex++;
            }
        }
        return result;
    }
}

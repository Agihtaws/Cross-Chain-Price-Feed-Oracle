// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./AggregatorV3Interface.sol"; 

interface IChainlinkFeedProxyExtended is AggregatorV3Interface {
    
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    
    function getRoundDataBetween(
        uint80 _fromRoundId,
        uint80 _toRoundId
    ) external view returns (RoundData[] memory);

    
    function maxHistory() external view returns (uint256);
}

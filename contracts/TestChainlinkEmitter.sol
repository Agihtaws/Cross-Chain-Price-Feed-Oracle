// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// This contract mimics the Chainlink AggregatorV3Interface's AnswerUpdated event signature.
// It allows for controlled emission of events for integration testing purposes.
contract TestChainlinkEmitter {
    // This event must have the exact same signature as Chainlink's AnswerUpdated
    // so that the ChainlinkReactiveBridge's subscription can detect it.
    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    /**
     * @dev Emits an AnswerUpdated event with the provided data.
     *      This function is called by the integration test script to simulate a Chainlink update.
     * @param _current The simulated price.
     * @param _roundId The simulated round ID.
     * @param _updatedAt The simulated timestamp of the update.
     */
    function emitAnswerUpdated(
        int256 _current,
        uint256 _roundId,
        uint256 _updatedAt
    ) external {
        emit AnswerUpdated(_current, _roundId, _updatedAt);
    }
}

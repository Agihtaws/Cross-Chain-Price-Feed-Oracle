# Cross-Chain Price Feed Oracle

This project implements a decentralized cross-chain price feed oracle using the Reactive Network, fulfilling the "Cross-Chain Price Feed Oracle" bounty requirements for Reactive Bounties 2.0. It mirrors official Chainlink Price Feeds from an origin EVM chain (Ethereum Sepolia Testnet) to the same destination chain (Ethereum Sepolia Testnet), making price data available via an `AggregatorV3Interface`-compatible interface for dApps.

## Project Overview

The service operates as follows:
1.  **Monitoring:** The `ChainlinkReactiveBridge` contract, deployed on Reactive Lasna Testnet, subscribes to `AnswerUpdated` events from official Chainlink Aggregators on Ethereum Sepolia Testnet.
2.  **Cross-Chain Relay:** Upon detecting a new price event, the bridge's `react()` function triggers two callbacks:
    *   One to update the corresponding `ChainlinkFeedProxy` contract on Ethereum Sepolia Testnet.
    *   A self-callback to update its own publicly queryable internal state on Reactive Lasna Testnet.
3.  **Data Consumption:** `ChainlinkFeedProxy` contracts on Ethereum Sepolia Testnet store the mirrored price data and expose it via the standard `AggregatorV3Interface`, enabling seamless consumption by downstream applications.

## Prerequisites

Ensure you have the following installed:

*   **Node.js** (LTS version recommended)
*   **npm** (Node Package Manager)
*   **Hardhat:** Ethereum development environment.
    ```bash
    npm install --save-dev hardhat
    npx hardhat compile
    ```
*   **Foundry (Cast):** For direct contract interaction and querying.
    ```bash
    curl -L https://foundry.paradigm.xyz | bash
    foundryup
    ```
*   **Git:** For cloning the repository.

## Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Agihtaws/Cross-Chain-Price-Feed-Oracle
    cd Cross-Chain-Price-Feed-Oracle
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables (`.env`):**
    Create a `.env` file in the root of your project directory and populate it with the necessary RPC URLs, private keys, and contract addresses. **Ensure all placeholder values are replaced with your actual values.**

    ```env
    # Private key for deployment (Replace with your actual Ethereum private key)
    PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY

    # RPC URLs
    SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
    REACTIVE_RPC=https://lasna-rpc.rnk.dev/

    # Chain IDs
    SEPOLIA_CHAIN_ID=11155111
    REACTIVE_CHAIN_ID=5318007

    # System Contract Address (Reactive Network - Lasna Testnet)
    SYSTEM_CONTRACT_ADDR=0x0000000000000000000000000000000000fffFfF

    # Callback Proxy Address (Ethereum Sepolia)
    SEPOLIA_CALLBACK_PROXY=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA

    # Chainlink Aggregator Addresses on Sepolia (Real Aggregators that emit events)
    CHAINLINK_ETH_USD_AGGREGATOR=0x719E22E3D4b690E5d96cCb40619180B5427F14AE
    CHAINLINK_BTC_USD_AGGREGATOR=0x17Dac87b07EAC97De4E182Fc51C925ebB7E723e2
    CHAINLINK_LINK_USD_AGGREGATOR=0x5A2734CC0341ea6564dF3D00171cc99C63B1A7d3

    # Etherscan API Key (Optional, for contract verification on Etherscan)
    ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY

    # Deployed ChainlinkFeedProxy Addresses (These will be populated after running deployFeedProxies.js)
    FEED_PROXY_ADDR_ETH_USD=
    FEED_PROXY_ADDR_BTC_USD=
    FEED_PROXY_ADDR_LINK_USD=

    # Deployed ChainlinkReactiveBridge Address (This will be populated after running deployBridge.js)
    BRIDGE_ADDR=

    # Deployed TestChainlinkEmitter Address (For integration tests, populate after deploy-emitter.js)
    TEST_CHAINLINK_EMITTER_ADDR=
    ```

## Deployment Instructions (Testnets)

All contracts are deployed to **Ethereum Sepolia Testnet** and **Reactive Lasna Testnet**.

1.  **Source Environment Variables:**
    Always run this command in your terminal session before executing any deployment or interaction scripts:
    ```bash
    source .env
    ```

2.  **Deploy `ChainlinkFeedProxy` Contracts (on Sepolia):**
    This script deploys the ETH/USD, BTC/USD, and LINK/USD `ChainlinkFeedProxy` contracts to Sepolia and funds them.
    ```bash
    npm run deploy:feed-proxies
    ```
    *After successful deployment, **update your `.env` file** with the generated `FEED_PROXY_ADDR_ETH_USD`, `FEED_PROXY_ADDR_BTC_USD`, and `FEED_PROXY_ADDR_LINK_USD` addresses as instructed by the script output.*

3.  **Deploy `ChainlinkReactiveBridge` Contract (on Reactive Lasna):**
    This script deploys your bridge contract to Reactive Lasna and funds it.
    ```bash
    npm run deploy:bridge
    ```
    *After successful deployment, **update your `.env` file** with the generated `BRIDGE_ADDR` as instructed by the script output.*

4.  **Deploy `TestChainlinkEmitter` (on Sepolia - for Integration Tests):**
    This contract is used to simulate Chainlink events for controlled integration testing.
    ```bash
    npx hardhat run scripts/deploy-emitter.js --network sepolia
    ```
    *After successful deployment, **update your `.env` file** with the generated `TEST_CHAINLINK_EMITTER_ADDR`.*

## Run Instructions

### 1. Monitor Price Feeds

This script monitors the status of your Chainlink sources, `ChainlinkFeedProxy` contracts, and the `ChainlinkReactiveBridge`'s internal state.

```bash
npx hardhat run scripts/monitorAllFeeds.js --network reactiveLasna
```

To run continuously:
```bash
npx hardhat run scripts/monitorAllFeeds.js --network reactiveLasna continuous
```

### 2. Manual cast Interactions (Examples)
After deploying and allowing time for price updates, you can use cast to query contract states.

Check ChainlinkReactiveBridge Internal State (Example: BTC/USD):
```bash
cast call $BRIDGE_ADDR "lastUpdateTimestampForAggregator(address)" $CHAINLINK_BTC_USD_AGGREGATOR --rpc-url $REACTIVE_RPC | cast to-dec
cast call $BRIDGE_ADDR "lastAnswerForAggregator(address)" $CHAINLINK_BTC_USD_AGGREGATOR --rpc-url $REACTIVE_RPC | cast to-dec
cast call $BRIDGE_ADDR "updateCountForAggregator(address)" $CHAINLINK_BTC_USD_AGGREGATOR --rpc-url $REACTIVE_RPC | cast to-dec
```

Check ChainlinkFeedProxy Latest Data (Example: ETH/USD):
```bash
cast call $FEED_PROXY_ADDR_ETH_USD "latestRoundData()" --rpc-url $SEPOLIA_RPC
```

### 3. Run Unit Tests
Unit tests verify individual contract logic on a local Hardhat Network.
```bash
npx hardhat test
```

### 4. Run Integration Tests (End-to-End Flow)
Integration tests simulate the full cross-chain flow on live testnets using the TestChainlinkEmitter.
Important Temporary Setup for Integration Tests:

Redeploy ChainlinkReactiveBridge for testing: Before running integration tests, you need to temporarily modify scripts/deploy-bridge.js to subscribe to your TEST_CHAINLINK_EMITTER_ADDR for one of the feeds.

Open scripts/deploy-bridge.js.
Find the chainlinkAggregatorAddresses array.
Temporarily replace one of the process.env.CHAINLINK_XXX_USD_AGGREGATOR entries with process.env.TEST_CHAINLINK_EMITTER_ADDR. For example, to test with the BTC feed proxy:
```bash
const chainlinkAggregatorAddresses = [
    process.env.CHAINLINK_ETH_USD_AGGREGATOR,
    process.env.TEST_CHAINLINK_EMITTER_ADDR, // Use emitter for BTC spot
    process.env.CHAINLINK_LINK_USD_AGGREGATOR
];
```

Redeploy the bridge with this change: npm run deploy:bridge. Update BRIDGE_ADDR in your .env with the new address.


### Execute Integration Test:
```bash
npx hardhat run scripts/integration-test.js --network reactiveLasna
```

### Revert Changes After Integration Testing:

After the integration test, revert the temporary modification in scripts/deploy-bridge.js (to subscribe back to the actual Chainlink aggregators).
Redeploy your ChainlinkReactiveBridge one final time for normal operation.


### Contract and Deployment Addresses
(This section will be populated with your actual deployed addresses for the final submission. Ensure these are up-to-date after all deployments.)
Reactive Lasna Testnet:

ChainlinkReactiveBridge Address: <YOUR_BRIDGE_ADDR>
RVM ID (Deployer Address): <YOUR_DEPLOYER_ADDRESS>

### Ethereum Sepolia Testnet:

ChainlinkFeedProxy (ETH/USD) Address: <YOUR_FEED_PROXY_ADDR_ETH_USD>
ChainlinkFeedProxy (BTC/USD) Address: <YOUR_FEED_PROXY_ADDR_BTC_USD>
ChainlinkFeedProxy (LINK/USD) Address: <YOUR_FEED_PROXY_ADDR_LINK_USD>
TestChainlinkEmitter Address (for integration tests): <YOUR_TEST_CHAINLINK_EMITTER_ADDR>


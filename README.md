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
    npm run deploy:proxy
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

### Deployed Contract Addresses and Environment Variables

The following addresses are for the deployed contracts on **Ethereum Sepolia Testnet** and **Reactive Lasna Testnet**. Ensure these are correctly set in your environment variables (e.g., in a `.env` file sourced before execution).

```bash
# System Contract Address (Reactive Network - Lasna Testnet)
SYSTEM_CONTRACT_ADDR=0x0000000000000000000000000000000000fffFfF

# Chainlink Aggregator Addresses on Sepolia (Real Aggregators that emit events)
CHAINLINK_ETH_USD_AGGREGATOR=0x719E22E3D4b690E5d96cCb40619180B5427F14AE
CHAINLINK_BTC_USD_AGGREGATOR=0x17Dac87b07EAC97De4E182Fc51C925ebB7E723e2
CHAINLINK_LINK_USD_AGGREGATOR=0x5A2734CC0341ea6564dF3D00171cc99C63B1A7d3

# Deployed ChainlinkFeedProxy Addresses on Ethereum Sepolia
FEED_PROXY_ADDR_ETH_USD=0x120a855499cC8e777cC1D06078Aff78d78bAa8f2
FEED_PROXY_ADDR_BTC_USD=0x9a1b222D6AC1467b4302CEE2fd28074B0bD8367f
FEED_PROXY_ADDR_LINK_USD=0xDBF1CdB10956ba2474B12042f78DB1A61061032F

# Deployed ChainlinkReactiveBridge Address on Reactive Lasna
BRIDGE_ADDR=0x7603470ae0116957ce2bC85929f63319dc07c7ef
```

### Transaction Hashes for Deployments

*   ChainlinkFeedProxy for ETH/USD:

    *   Transaction Hash: 0x54a0338718008727754994f2c0a1e66373aa45112d3283bb4e8b2678680770d6
    *   Etherscan Verification: https://sepolia.etherscan.io/address/0x120a855499cC8e777cC1D06078Aff78d78bAa8f2#code


*   ChainlinkFeedProxy for BTC/USD:

    *   Transaction Hash: 0xdbe1333523bfeeb09e7248f54d7e922bfc2f332bdea19b1d9c75d0166fa43612
    *   Etherscan Verification: https://sepolia.etherscan.io/address/0x9a1b222D6AC1467b4302CEE2fd28074B0bD8367f#code


*   ChainlinkFeedProxy for LINK/USD:

    *   Transaction Hash: 0xfda2c751387567e06975c246828b55f92d6f93dd5cf79990c4bdf686eb73be19
    *   Etherscan Verification: https://sepolia.etherscan.io/address/0xDBF1CdB10956ba2474B12042f78DB1A61061032F#code


*   ChainlinkReactiveBridge:

    *   Transaction Hash: 0x81d1d220b147745375d43ceafb051bfb3143fe892bd2feecb3e66434ab57aec1
    *   Reactscan RVM ID: https://lasna.reactscan.net/rvm/0x63eea403e3075D9e6b5eA18c28021e6FfdD04a67



### Funding ChainlinkReactiveBridge

To fund your ChainlinkReactiveBridge contract on the Reactive Lasna Testnet and activate it, you can deposit REACT tokens via the Reactive Network's system contract. This method automatically settles any outstanding debt.

First, ensure your PRIVATE_KEY and REACTIVE_RPC environment variables are correctly sourced.
Here is the cast command to fund your contract with 0.1 REACT:
```bash
cast send --rpc-url $REACTIVE_RPC --private-key $PRIVATE_KEY 0x0000000000000000000000000000000000fffFfF "depositTo(address)" 0x7603470ae0116957ce2bC85929f63319dc07c7ef --value 0.1ether
```

After executing this command, you can verify the new balance of your ChainlinkReactiveBridge contract using the following cast command:
```bash
cast balance 0x7603470ae0116957ce2bC85929f63319dc07c7ef --rpc-url $REACTIVE_RPC
```

Monitor Price Feeds
This script monitors the status of your Chainlink sources, ChainlinkFeedProxy contracts, and the ChainlinkReactiveBridge's internal state.
```bash
npx hardhat run scripts/monitorAllFeeds.js --network reactiveLasna
```

To run continuously:
```bash
npx hardhat run scripts/monitorAllFeeds.js --network reactiveLasna continuous
```

### Manual cast Interactions (Examples)
After deploying and allowing time for price updates, you can use cast to query contract states.
Check ChainlinkReactiveBridge Internal State (Example: BTC/USD):
```bash
cast call $BRIDGE_ADDR "lastUpdateTimestampForAggregator(address)" $CHAINLINK_BTC_USD_AGGREGATOR --rpc-url $REACTIVE_RPC | cast to-dec
```

## Documentation and License

*   **Project Documentation (PDF):** [Documentation](https://github.com/Agihtaws/Cross-Chain-Price-Feed-Oracle/blob/main/Documentation.pdf)
*   **MIT License:** [License](https://github.com/Agihtaws/Cross-Chain-Price-Feed-Oracle/blob/main/LICENSE)

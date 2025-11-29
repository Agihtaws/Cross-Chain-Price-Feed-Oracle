require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  
  networks: {
    // Ethereum Sepolia - Origin chain (where Chainlink feeds exist)
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://eth-sepolia.g.alchemy.com/v2/your-api-key",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto",
    },

    // Reactive Lasna Testnet - Where reactive contract runs
    reactiveLasna: {
      url: process.env.REACTIVE_RPC || "https://lasna-rpc.rnk.dev/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5318007,
      gasPrice: "auto",
    },

    // Hardhat local network for testing
    hardhat: {
      chainId: 31337,
    },
  },

  etherscan: {
    // Use a single Etherscan API key for V2, as per Etherscan's V2 migration.
    // The hardhat-etherscan plugin will handle chain-specific verification
    // using this single key.
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },

  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.rnk.dev/",
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 40000,
  },
};

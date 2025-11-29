const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting ChainlinkReactiveBridge deployment on Reactive Lasna...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "REACT\n");

    const originChainId = process.env.SEPOLIA_CHAIN_ID;
    const destinationChainId = process.env.SEPOLIA_CHAIN_ID;
    const reactiveNetworkChainId = process.env.REACTIVE_CHAIN_ID; // Get Reactive Network's Chain ID
    const fundingAmount = hre.ethers.parseEther("0.1"); // Fund with 0.1 REACT

    // Collect all aggregator and feed proxy addresses from .env
    const chainlinkAggregatorAddresses = [
        process.env.CHAINLINK_ETH_USD_AGGREGATOR,
        process.env.CHAINLINK_BTC_USD_AGGREGATOR,
        process.env.CHAINLINK_LINK_USD_AGGREGATOR
    ];

    const feedProxyAddresses = [
        process.env.FEED_PROXY_ADDR_ETH_USD,
        process.env.FEED_PROXY_ADDR_BTC_USD,
        process.env.FEED_PROXY_ADDR_LINK_USD
    ];

    const decimalsArray = [8, 8, 8]; // Decimals for ETH/USD, BTC/USD, LINK/USD
    const descriptionsArray = ["ETH / USD", "BTC / USD", "LINK / USD"]; // Descriptions

    // Basic validation
    if (chainlinkAggregatorAddresses.some(addr => !addr)) {
        throw new Error("One or more CHAINLINK_XXX_USD_AGGREGATOR addresses not set in .env.");
    }
    if (feedProxyAddresses.some(addr => !addr)) {
        throw new Error("One or more FEED_PROXY_ADDR_XXX_USD addresses not set in .env. Deploy FeedProxies first!");
    }
    if (chainlinkAggregatorAddresses.length !== feedProxyAddresses.length ||
        chainlinkAggregatorAddresses.length !== decimalsArray.length ||
        chainlinkAggregatorAddresses.length !== descriptionsArray.length) {
        throw new Error("Mismatch in array lengths for deployment parameters.");
    }

    console.log("Deployment parameters:");
    console.log("- Origin Chain ID:", originChainId);
    console.log("- Destination Chain ID:", destinationChainId);
    console.log("- Reactive Network Chain ID:", reactiveNetworkChainId);
    console.log("- Chainlink Aggregator Addresses:", chainlinkAggregatorAddresses);
    console.log("- Feed Proxy Addresses:", feedProxyAddresses);
    console.log("- Decimals Array:", decimalsArray);
    console.log("- Description Array:", descriptionsArray);
    console.log("- Funding Amount:", hre.ethers.formatEther(fundingAmount), "REACT\n");

    const ChainlinkReactiveBridge = await hre.ethers.getContractFactory("ChainlinkReactiveBridge");
    const bridge = await ChainlinkReactiveBridge.deploy(
        originChainId,
        destinationChainId,
        reactiveNetworkChainId, // Pass Reactive Network Chain ID
        chainlinkAggregatorAddresses,
        feedProxyAddresses,
        decimalsArray,
        descriptionsArray,
        { value: fundingAmount }
    );

    await bridge.waitForDeployment();
    const bridgeAddress = await bridge.getAddress();
    process.env.BRIDGE_ADDR = bridgeAddress; // Update env for later scripts

    console.log("✅ ChainlinkReactiveBridge deployed to:", bridgeAddress);
    console.log("Transaction hash:", bridge.deploymentTransaction().hash);
    console.log("\nWaiting for block confirmations...");

    await bridge.deploymentTransaction().wait(5);
    console.log("✅ Confirmed!\n");

    console.log("Verifying contract on Reactive Sourcify...");
    try {
        await hre.run("verify:verify", {
            address: bridgeAddress,
            constructorArguments: [
                originChainId,
                destinationChainId,
                reactiveNetworkChainId, // Pass Reactive Network Chain ID for verification
                chainlinkAggregatorAddresses,
                feedProxyAddresses,
                decimalsArray,
                descriptionsArray
            ],
        });
        console.log("✅ Contract verified on Sourcify\n");
    } catch (error) {
        console.log("⚠️  Verification failed:", error.message, "\n");
    }

    console.log("=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Network:", hre.network.name);
    console.log("ChainlinkReactiveBridge:", bridgeAddress);
    console.log("RVM ID (Deployer):", deployer.address);
    console.log("Monitored Aggregators:", chainlinkAggregatorAddresses);
    console.log("Corresponding Feed Proxies:", feedProxyAddresses);
    console.log("=".repeat(60));
    console.log("\n🎯 Reactive contract is now monitoring Chainlink feeds!");
    console.log(`\nReactscan: https://lasna.reactscan.net/rvm/${deployer.address}`);
    console.log(`\nexport BRIDGE_ADDR=${bridgeAddress}\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

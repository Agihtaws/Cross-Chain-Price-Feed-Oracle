const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting ChainlinkFeedProxy deployments on Sepolia...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    const callbackProxy = process.env.SEPOLIA_CALLBACK_PROXY;
    const fundingAmount = hre.ethers.parseEther("0.005");
    const maxHistory = 100;

    // Define the feeds to deploy
    const feedsToDeploy = [
        {
            symbol: "ETH_USD",
            aggregator: process.env.CHAINLINK_ETH_USD_AGGREGATOR,
            decimals: 8,
            description: "ETH / USD",
            envVar: "FEED_PROXY_ADDR_ETH_USD"
        },
        {
            symbol: "BTC_USD",
            aggregator: process.env.CHAINLINK_BTC_USD_AGGREGATOR,
            decimals: 8,
            description: "BTC / USD",
            envVar: "FEED_PROXY_ADDR_BTC_USD"
        },
        {
            symbol: "LINK_USD",
            aggregator: process.env.CHAINLINK_LINK_USD_AGGREGATOR,
            decimals: 8,
            description: "LINK / USD",
            envVar: "FEED_PROXY_ADDR_LINK_USD"
        }
    ];

    const deployedFeedProxyAddresses = {};

    for (const feed of feedsToDeploy) {
        console.log(`\n--- Deploying ChainlinkFeedProxy for ${feed.symbol} ---`);
        console.log("Deployment parameters:");
        console.log("- Callback Proxy:", callbackProxy);
        console.log("- Source Aggregator:", feed.aggregator);
        console.log("- Decimals:", feed.decimals);
        console.log("- Description:", feed.description);
        console.log("- Funding Amount:", hre.ethers.formatEther(fundingAmount), "ETH");
        console.log("- Max History:", maxHistory, "\n");

        const ChainlinkFeedProxy = await hre.ethers.getContractFactory("ChainlinkFeedProxy");
        const feedProxy = await ChainlinkFeedProxy.deploy(
            callbackProxy,
            feed.aggregator,
            feed.decimals,
            feed.description,
            maxHistory,
            { value: fundingAmount }
        );

        await feedProxy.waitForDeployment();
        const proxyAddress = await feedProxy.getAddress();
        deployedFeedProxyAddresses[feed.symbol] = proxyAddress;

        console.log(`✅ ChainlinkFeedProxy for ${feed.symbol} deployed to:`, proxyAddress);
        console.log("Transaction hash:", feedProxy.deploymentTransaction().hash);
        console.log("\nWaiting for block confirmations...");

        await feedProxy.deploymentTransaction().wait(5);
        console.log("✅ Confirmed!\n");

        console.log("Verifying contract on Etherscan...");
        try {
            await hre.run("verify:verify", {
                address: proxyAddress,
                constructorArguments: [
                    callbackProxy,
                    feed.aggregator,
                    feed.decimals,
                    feed.description,
                    maxHistory
                ],
            });
            console.log("✅ Contract verified on Etherscan\n");
        } catch (error) {
            console.log("⚠️  Verification failed:", error.message, "\n");
        }
    }

    console.log("=".repeat(60));
    console.log("DEPLOYMENT SUMMARY - ALL FEED PROXIES");
    console.log("=".repeat(60));
    console.log("Network:", hre.network.name);
    console.log("Deployer:", deployer.address);
    for (const symbol in deployedFeedProxyAddresses) {
        console.log(`ChainlinkFeedProxy (${symbol}):`, deployedFeedProxyAddresses[symbol]);
    }
    console.log("Max History:", maxHistory);
    console.log("=".repeat(60));
    console.log("\n💾 Save these addresses for bridge deployment!");
    for (const feed of feedsToDeploy) {
        console.log(`export ${feed.envVar}=${deployedFeedProxyAddresses[feed.symbol]}`);
    }
    console.log("\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

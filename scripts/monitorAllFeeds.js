const hre = require("hardhat");
require("dotenv").config();

// Helper function to pause execution
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to format timestamp
function formatTimestamp(timestamp) {
    if (timestamp === undefined || timestamp === null || (typeof timestamp === 'bigint' && timestamp === 0n)) return "N/A";
    return new Date(Number(timestamp) * 1000).toISOString();
}

// Helper to format price with correct decimals using ethers.formatUnits
function formatPrice(rawPrice, decimals) {
    if (rawPrice === undefined || rawPrice === null) return "N/A";
    try {
        // Use ethers.formatUnits directly to convert BigInt to a decimal string.
        // This function is designed to handle BigInt values correctly.
        return hre.ethers.formatUnits(rawPrice, decimals);
    } catch (error) {
        // If there's an error in formatting (e.g., rawPrice is not a valid BigInt due to a contract error),
        // return "ERROR" instead of crashing.
        return "ERROR";
    }
}

// --- Functions to fetch data from contracts ---

// Fetches latest data from the canonical Chainlink Aggregator
async function getChainlinkSourcePrice(aggregatorAddress, decimals) {
    const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);
    const aggregatorAbi = [
        "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
    ];
    const aggregator = new hre.ethers.Contract(aggregatorAddress, aggregatorAbi, provider);
    
    try {
        const [roundId, answer, startedAt, updatedAt, answeredInRound] = await aggregator.latestRoundData();
        return {
            source: "Chainlink",
            aggregatorAddress: aggregatorAddress,
            roundId: roundId.toString(),
            price: formatPrice(answer, decimals),
            startedAt: formatTimestamp(startedAt),
            updatedAt: formatTimestamp(updatedAt),
            answeredInRound: answeredInRound.toString(),
            rawAnswer: answer.toString(),
            decimals: decimals
        };
    } catch (error) {
        return { source: "Chainlink", aggregatorAddress: aggregatorAddress, error: error.message, decimals: decimals };
    }
}

// Fetches latest data from our ChainlinkFeedProxy contract
async function getFeedProxyPrice(proxyAddress) {
    const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);
    const feedProxyAbi = [
        "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
        "function decimals() external view returns (uint8)",
        "function description() external view returns (string)",
        "function maxHistory() external view returns (uint256)",
        "function sourceAggregator() external view returns (address)"
    ];
    const feedProxy = new hre.ethers.Contract(proxyAddress, feedProxyAbi, provider);
    
    try {
        const [roundId, answer, startedAt, updatedAt, answeredInRound] = await feedProxy.latestRoundData();
        const decimals = await feedProxy.decimals();
        const description = await feedProxy.description();
        const maxHistory = await feedProxy.maxHistory();
        const sourceAggregator = await feedProxy.sourceAggregator();

        return {
            source: "FeedProxy",
            proxyAddress: proxyAddress,
            description: description,
            roundId: roundId.toString(),
            price: formatPrice(answer, decimals),
            startedAt: formatTimestamp(startedAt),
            updatedAt: formatTimestamp(updatedAt),
            answeredInRound: answeredInRound.toString(),
            rawAnswer: answer.toString(),
            decimals: decimals,
            maxHistory: maxHistory.toString(),
            sourceAggregator: sourceAggregator
        };
    } catch (error) {
        return { source: "FeedProxy", proxyAddress: proxyAddress, error: error.message };
    }
}

// Fetches internal state for a specific aggregator from the ChainlinkReactiveBridge
async function getBridgeAggregatorStatus(bridgeAddress, aggregatorAddress, decimals) {
    const provider = new hre.ethers.JsonRpcProvider(process.env.REACTIVE_RPC);
    const bridgeAbi = [
        "function lastUpdateTimestampForAggregator(address) external view returns (uint256)",
        "function lastAnswerForAggregator(address) external view returns (int256)",
        "function updateCountForAggregator(address) external view returns (uint256)",
    ];
    const bridge = new hre.ethers.Contract(bridgeAddress, bridgeAbi, provider);

    try {
        const lastUpdateTimestamp = await bridge.lastUpdateTimestampForAggregator(aggregatorAddress);
        const lastAnswer = await bridge.lastAnswerForAggregator(aggregatorAddress);
        const updateCount = await bridge.updateCountForAggregator(aggregatorAddress);
        
        return {
            aggregatorAddress: aggregatorAddress,
            updateCount: updateCount.toString(),
            lastPrice: lastAnswer > 0n ? formatPrice(lastAnswer, decimals) : "N/A",
            lastUpdate: lastUpdateTimestamp > 0n ? formatTimestamp(lastUpdateTimestamp) : "N/A"
        };
    } catch (error) {
        return { aggregatorAddress: aggregatorAddress, error: error.message };
    }
}

// --- Main monitoring logic ---

async function monitorAllFeedsOnce() {
    const timestamp = new Date().toISOString();
    
    console.log("\n" + "█".repeat(80));
    console.log(`MULTI-FEED PRICE MONITOR - ${timestamp}`);
    console.log("█".repeat(80));
    
    const feedsConfig = [
        {
            symbol: "ETH_USD",
            aggregator: process.env.CHAINLINK_ETH_USD_AGGREGATOR,
            proxy: process.env.FEED_PROXY_ADDR_ETH_USD,
            decimals: 8 
        },
        {
            symbol: "BTC_USD",
            aggregator: process.env.CHAINLINK_BTC_USD_AGGREGATOR,
            proxy: process.env.FEED_PROXY_ADDR_BTC_USD,
            decimals: 8 
        },
        {
            symbol: "LINK_USD",
            aggregator: process.env.CHAINLINK_LINK_USD_AGGREGATOR,
            proxy: process.env.FEED_PROXY_ADDR_LINK_USD,
            decimals: 8 
        }
    ];

    const bridgeAddress = process.env.BRIDGE_ADDR;
    if (!bridgeAddress) {
        console.error("❌ BRIDGE_ADDR not set in .env. Please deploy the ChainlinkReactiveBridge first.");
        return;
    }

    console.log("\nFetching data for all configured feeds...\n");

    for (const feed of feedsConfig) {
        if (!feed.aggregator || !feed.proxy) {
            console.log(`--- Skipping ${feed.symbol}: Aggregator or Proxy address not set ---`);
            continue;
        }

        console.log(`\n${"=".repeat(20)} ${feed.symbol} PRICE FEED STATUS ${"=".repeat(20)}`);

        const [chainlinkData, proxyData, bridgeStatus] = await Promise.all([
            getChainlinkSourcePrice(feed.aggregator, feed.decimals),
            getFeedProxyPrice(feed.proxy),
            getBridgeAggregatorStatus(bridgeAddress, feed.aggregator, feed.decimals)
        ]);

        // --- Display Chainlink Source Data ---
        console.log("\n--- Chainlink Source ---");
        if (chainlinkData.error) {
            console.log("❌ Error fetching Chainlink data:", chainlinkData.error);
        } else {
            console.log(`Aggregator: ${chainlinkData.aggregatorAddress}`);
            console.log(`Round ID:   ${chainlinkData.roundId}`);
            console.log(`Price:      ${chainlinkData.price} USD`);
            console.log(`Updated At: ${chainlinkData.updatedAt}`);
        }

        // --- Display FeedProxy Data ---
        console.log("\n--- Our FeedProxy ---");
        if (proxyData.error) {
            console.log("⏳ FeedProxy Status:", proxyData.error);
            console.log("   Waiting for first update from reactive bridge.");
        } else {
            console.log(`Proxy Address: ${proxyData.proxyAddress}`);
            console.log(`Description:   ${proxyData.description}`);
            console.log(`Round ID:      ${proxyData.roundId}`);
            console.log(`Price:         ${proxyData.price} USD`);
            console.log(`Updated At:    ${proxyData.updatedAt}`);
            console.log(`Max History:   ${proxyData.maxHistory}`);
            console.log(`Source Aggregator (as configured): ${proxyData.sourceAggregator}`);

            // Compare data if both sources are available
            if (!chainlinkData.error) {
                console.log("\n--- Data Comparison ---");
                const isRoundIdMatch = chainlinkData.roundId === proxyData.roundId;
                const isPriceMatch = chainlinkData.rawAnswer === proxyData.rawAnswer; 
                const isTimestampMatch = chainlinkData.updatedAt === proxyData.updatedAt;

                console.log(`Round ID Match:   ${isRoundIdMatch ? "✅ Yes" : "❌ No"}`);
                console.log(`Price Match:      ${isPriceMatch ? "✅ Yes" : "❌ No"}`);
                console.log(`Timestamp Match:  ${isTimestampMatch ? "✅ Yes" : "❌ No"}`);

                if (!isRoundIdMatch || !isPriceMatch || !isTimestampMatch) {
                    console.log("⚠️  Discrepancy detected. FeedProxy might be awaiting a new update or there's a problem.");
                } else {
                    console.log("✅ All data points match between Chainlink source and FeedProxy.");
                }
            }
        }

        // --- Display Reactive Bridge Status (for this feed) ---
        console.log("\n--- Reactive Bridge Status (for this feed) ---");
        if (bridgeStatus.error) {
            console.log("❌ Error fetching Reactive Bridge status for this feed:", bridgeStatus.error);
        } else {
            console.log(`Bridge Address: ${bridgeAddress}`);
            console.log(`Aggregator:     ${bridgeStatus.aggregatorAddress}`);
            console.log(`Updates Processed: ${bridgeStatus.updateCount}`);
            console.log(`Last Price Seen:   ${bridgeStatus.lastPrice} USD`);
            console.log(`Last Update:       ${bridgeStatus.lastUpdate}`);
        }
        console.log(`${"=".repeat(80)}\n`);
    }

    // --- Display overall Reactive Bridge status ---
    console.log(`\n${"=".repeat(20)} OVERALL REACTIVE BRIDGE STATUS ${"=".repeat(20)}`);
    const provider = new hre.ethers.JsonRpcProvider(process.env.REACTIVE_RPC);
    const bridgeOverallAbi = [
        "function originChainId() external view returns (uint256)",
        "function destinationChainId() external view returns (uint256)",
        "function monitoredAggregators(uint256) external view returns (address)", 
        "function monitoredAggregatorsLength() external view returns (uint256)" 
    ];
    const bridgeOverall = new hre.ethers.Contract(bridgeAddress, bridgeOverallAbi, provider);

    try {
        const deployer = (await hre.ethers.getSigners())[0]; // Get deployer address for RVM ID
        const bridgeBalance = await provider.getBalance(bridgeAddress);
        console.log(`Bridge Contract Address: ${bridgeAddress}`);
        console.log(`Balance: ${hre.ethers.formatEther(bridgeBalance)} REACT`);
        
        const debtContract = new hre.ethers.Contract(process.env.SYSTEM_CONTRACT_ADDR, ["function debts(address) external view returns (uint256)"], provider);
        const debt = await debtContract.debts(bridgeAddress);
        console.log(`Outstanding Debt: ${hre.ethers.formatEther(debt)} REACT`);

        console.log(`Owner/RVM ID (Deployer): ${deployer.address}`); // Use deployer address as RVM ID
        console.log(`Origin Chain ID: ${await bridgeOverall.originChainId()}`);
        console.log(`Destination Chain ID: ${await bridgeOverall.destinationChainId()}`);
        
        let monitoredAggregatorsCount = 0;
        try {
            monitoredAggregatorsCount = await bridgeOverall.monitoredAggregatorsLength();
        } catch (e) {
            console.warn("⚠️  monitoredAggregatorsLength() not found, attempting to iterate public array (this might be slow/expensive)...");
            let i = 0;
            while(true) {
                try {
                    await bridgeOverall.monitoredAggregators(i); 
                    i++;
                } catch {
                    break;
                }
            }
            monitoredAggregatorsCount = i;
        }

        console.log(`Total Monitored Feeds: ${monitoredAggregatorsCount}`);
        for (let i = 0; i < monitoredAggregatorsCount; i++) {
            console.log(`  - Aggregator ${i + 1}: ${await bridgeOverall.monitoredAggregators(i)}`);
        }

    } catch (error) {
        console.log("❌ Error fetching overall Reactive Bridge status:", error.message);
    }
    console.log(`${"=".repeat(80)}\n`);
}

// Main execution function to run once or continuously
async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || "once";
    const interval = parseInt(args[1]) || 30;
    
    if (mode === "continuous" || mode === "watch") {
        console.log("\n🔄 Starting continuous monitoring...");
        console.log(`📊 Checking every ${interval} seconds`);
        console.log("⏹️  Press Ctrl+C to stop\n");
        
        while (true) {
            await monitorAllFeedsOnce();
            console.log(`\n⏳ Waiting ${interval} seconds for next check...\n`);
            await sleep(interval * 1000);
        }
    } else {
        await monitorAllFeedsOnce();
    }
}

main()
    .then(() => {
        if (process.argv.slice(2)[0] !== "continuous" && process.argv.slice(2)[0] !== "watch") {
            process.exit(0);
        }
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

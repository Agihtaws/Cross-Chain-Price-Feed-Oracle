const hre = require("hardhat");
require("dotenv").config();

// Helper to pause execution for network propagation (crucial for real-time testnets)
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("--- Starting End-to-End Integration Test ---");

    // --- Configuration ---
    const deployerPrivateKey = process.env.PRIVATE_KEY;
    const sepoliaRpc = process.env.SEPOLIA_RPC;
    const reactiveRpc = process.env.REACTIVE_RPC;
    const sepoliaCallbackProxy = process.env.SEPOLIA_CALLBACK_PROXY;
    const reactiveNetworkChainId = process.env.REACTIVE_CHAIN_ID;
    const sepoliaChainId = process.env.SEPOLIA_CHAIN_ID;

    const testEmitterAddress = process.env.TEST_CHAINLINK_EMITTER_ADDR; // Your deployed TestChainlinkEmitter on Sepolia

    if (!testEmitterAddress || !sepoliaCallbackProxy || !deployerPrivateKey || !sepoliaRpc || !reactiveRpc || !reactiveNetworkChainId || !sepoliaChainId) {
        throw new Error("Missing environment variables for integration test. Ensure all necessary variables are set in .env.");
    }

    // --- Setup Providers and Signers ---
    const sepoliaProvider = new hre.ethers.JsonRpcProvider(sepoliaRpc);
    const reactiveProvider = new hre.ethers.JsonRpcProvider(reactiveRpc);

    const sepoliaSigner = new hre.ethers.Wallet(deployerPrivateKey, sepoliaProvider);
    const reactiveSigner = new hre.ethers.Wallet(deployerPrivateKey, reactiveProvider);

    // Attach to the deployed TestChainlinkEmitter
    const TestChainlinkEmitterFactory = await hre.ethers.getContractFactory("TestChainlinkEmitter", sepoliaSigner);
    const testEmitter = TestChainlinkEmitterFactory.attach(testEmitterAddress);

    console.log(`\nTest Emitter on Sepolia: ${testEmitterAddress}`);

    // --- Step 0: Deploy a NEW ChainlinkFeedProxy for this integration test ---
    console.log("\n--- Step 0: Deploying a NEW ChainlinkFeedProxy for integration test ---");
    const testFeedProxyFundingAmount = hre.ethers.parseEther("0.005");
    const testFeedProxyMaxHistory = 50; // Smaller history for faster testing
    
    const ChainlinkFeedProxyFactory = await hre.ethers.getContractFactory("ChainlinkFeedProxy", sepoliaSigner);
    const testFeedProxy = await ChainlinkFeedProxyFactory.deploy(
        sepoliaCallbackProxy,
        testEmitterAddress, // Set sourceAggregator to the TestEmitter for this test proxy
        8, // Decimals
        "TEST / USD", // Description
        testFeedProxyMaxHistory,
        { value: testFeedProxyFundingAmount }
    );
    await testFeedProxy.waitForDeployment();
    const testFeedProxyAddress = await testFeedProxy.getAddress();
    console.log(`✅ Test ChainlinkFeedProxy deployed to: ${testFeedProxyAddress}`);
    console.log(`   Tx Hash: ${testFeedProxy.deploymentTransaction().hash}`);
    await testFeedProxy.deploymentTransaction().wait(5); // Wait for confirmations
    console.log("✅ Test ChainlinkFeedProxy Confirmed!\n");

    // --- Step 0.1: Deploy a NEW ChainlinkReactiveBridge for this integration test ---
    console.log("\n--- Step 0.1: Deploying a NEW ChainlinkReactiveBridge for integration test ---");
    const bridgeFundingAmount = hre.ethers.parseEther("0.1");
    
    const ChainlinkReactiveBridgeFactory = await hre.ethers.getContractFactory("ChainlinkReactiveBridge", reactiveSigner);
    const bridge = await ChainlinkReactiveBridgeFactory.deploy(
        sepoliaChainId,
        sepoliaChainId,
        reactiveNetworkChainId,
        [testEmitterAddress], // Bridge subscribes to the TestEmitter
        [testFeedProxyAddress], // Bridge targets the NEW Test FeedProxy
        [8],
        ["TEST / USD"],
        { value: bridgeFundingAmount }
    );
    await bridge.waitForDeployment();
    const bridgeAddress = await bridge.getAddress();
    console.log(`✅ Test ChainlinkReactiveBridge deployed to: ${bridgeAddress}`);
    console.log(`   Tx Hash: ${bridge.deploymentTransaction().hash}`);
    await bridge.deploymentTransaction().wait(5); // Wait for confirmations
    console.log("✅ Test ChainlinkReactiveBridge Confirmed!\n");

    // Re-attach bridge and proxy with their correct new addresses for the test run
    const bridgeInstance = ChainlinkReactiveBridgeFactory.attach(bridgeAddress);
    const proxyInstance = ChainlinkFeedProxyFactory.attach(testFeedProxyAddress);


    // --- Step 1: Trigger an event from the custom emitter on Sepolia ---
    console.log("\n--- Step 1: Emitting a test Chainlink event from Sepolia ---");
    const testRoundId = 12345n; // Changed to BigInt
    const testAnswer = 9500000000000n; 
    const testUpdatedAt = BigInt((await sepoliaProvider.getBlock("latest")).timestamp + 10); // Changed to BigInt
    
    console.log(`Emitting event: Round ID=${testRoundId}, Answer=${testAnswer}, UpdatedAt=${testUpdatedAt}`);
    const emitTx = await testEmitter.emitAnswerUpdated(testAnswer, testRoundId, testUpdatedAt);
    await emitTx.wait();
    console.log(`✅ Event emitted on Sepolia. Tx Hash: ${emitTx.hash}`);

    // --- Step 2: Wait for Reactive Network to process and propagate callbacks ---
    console.log("\n--- Step 2: Waiting for Reactive Network processing (approx. 90 seconds) ---");
    await sleep(90 * 1000); 

    // --- Step 3: Verifying Test ChainlinkFeedProxy state on Sepolia ---
    console.log("\n--- Step 3: Verifying Test ChainlinkFeedProxy state on Sepolia ---");
    const proxyLatestData = await proxyInstance.latestRoundData();
    console.log(`Test FeedProxy latest data: Round ID=${proxyLatestData.roundId}, Answer=${proxyLatestData.answer}, UpdatedAt=${proxyLatestData.updatedAt}`);

    // Ensure comparisons are made with BigInts
    if (proxyLatestData.roundId === testRoundId && proxyLatestData.answer === testAnswer && proxyLatestData.updatedAt === testUpdatedAt) {
        console.log("✅ Test ChainlinkFeedProxy updated successfully!");
    } else {
        console.error("❌ Test ChainlinkFeedProxy did NOT update as expected!");
        console.error(`Expected: Round ID=${testRoundId}, Answer=${testAnswer}, UpdatedAt=${testUpdatedAt}`);
        console.error(`Actual:   Round ID=${proxyLatestData.roundId}, Answer=${proxyLatestData.answer}, UpdatedAt=${proxyLatestData.updatedAt}`);
        process.exit(1);
    }

    // --- Step 4: Verify internal state on Test ChainlinkReactiveBridge (Reactive Lasna) ---
    console.log("\n--- Step 4: Verifying ChainlinkReactiveBridge internal state on Reactive Lasna ---");
    const bridgeLastUpdateTimestamp = await bridgeInstance.lastUpdateTimestampForAggregator(testEmitterAddress);
    const bridgeLastAnswer = await bridgeInstance.lastAnswerForAggregator(testEmitterAddress);
    const bridgeUpdateCount = await bridgeInstance.updateCountForAggregator(testEmitterAddress);

    console.log(`Test Bridge internal state (for Test Emitter): LastUpdateTimestamp=${bridgeLastUpdateTimestamp}, LastAnswer=${bridgeLastAnswer}, UpdateCount=${bridgeUpdateCount}`);

    // Ensure comparisons are made with BigInts
    if (bridgeLastUpdateTimestamp === testUpdatedAt && bridgeLastAnswer === testAnswer && bridgeUpdateCount === 1n) { 
        console.log("✅ Test ChainlinkReactiveBridge internal state updated successfully!");
    } else {
        console.error("❌ Test ChainlinkReactiveBridge internal state did NOT update as expected!");
        console.error(`Expected: LastUpdateTimestamp=${testUpdatedAt}, LastAnswer=${testAnswer}, UpdateCount=1`);
        console.error(`Actual:   LastUpdateTimestamp=${bridgeLastUpdateTimestamp}, LastAnswer=${bridgeLastAnswer}, UpdateCount=${bridgeUpdateCount}`);
        process.exit(1);
    }

    console.log("\n--- End-to-End Integration Test Completed Successfully! ---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

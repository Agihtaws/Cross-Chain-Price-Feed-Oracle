const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainlinkFeedProxy Unit Tests", function () {
    let deployer;
    let callbackProxyAddress; // Represents the Reactive Network's Callback Proxy on Sepolia
    let sourceAggregatorAddress; // Represents the canonical Chainlink Aggregator on Sepolia
    let feedProxy;

    const DEFAULT_DECIMALS = 8;
    const DEFAULT_DESCRIPTION = "ETH / USD";
    const DEFAULT_MAX_HISTORY = 100;

    beforeEach(async function () {
        [deployer] = await ethers.getSigners();
        // For unit testing, the deployer acts as the authorized callback proxy sender.
        callbackProxyAddress = deployer.address; 
        // A random address to simulate a source aggregator.
        sourceAggregatorAddress = ethers.Wallet.createRandom().address; 

        const ChainlinkFeedProxyFactory = await ethers.getContractFactory("ChainlinkFeedProxy");
        feedProxy = await ChainlinkFeedProxyFactory.deploy(
            callbackProxyAddress,
            sourceAggregatorAddress,
            DEFAULT_DECIMALS,
            DEFAULT_DESCRIPTION,
            DEFAULT_MAX_HISTORY,
            { value: ethers.parseEther("0.005") } // Initial funding for the proxy
        );
        await feedProxy.waitForDeployment();
    });

    // --- Constructor Tests ---
    it("Should deploy with correct initial state", async function () {
        expect(await feedProxy.sourceAggregator()).to.equal(sourceAggregatorAddress);
        expect(await feedProxy.decimals()).to.equal(DEFAULT_DECIMALS);
        expect(await feedProxy.description()).to.equal(DEFAULT_DESCRIPTION);
        expect(await feedProxy.maxHistory()).to.equal(DEFAULT_MAX_HISTORY);
        expect(await feedProxy.version()).to.equal(1);
        expect(await ethers.provider.getBalance(await feedProxy.getAddress())).to.equal(ethers.parseEther("0.005"));
    });

    it("Should revert if sourceAggregator is address(0)", async function () {
        const ChainlinkFeedProxyFactory = await ethers.getContractFactory("ChainlinkFeedProxy");
        await expect(
            ChainlinkFeedProxyFactory.deploy(
                callbackProxyAddress,
                ethers.ZeroAddress, // Invalid sourceAggregator
                DEFAULT_DECIMALS,
                DEFAULT_DESCRIPTION,
                DEFAULT_MAX_HISTORY,
                { value: ethers.parseEther("0.005") }
            )
        ).to.be.revertedWith("Invalid source aggregator");
    });

    // --- updatePrice() Function Tests ---
    it("Should update price correctly and emit events when called by authorized RVM ID", async function () {
        const newRoundId = 1;
        const newAnswer = 3000000000000n; // Example: 3000.00 USD with 8 decimals
        const newStartedAt = (await ethers.provider.getBlock("latest")).timestamp;
        const newUpdatedAt = newStartedAt + 60;
        const newAnsweredInRound = 1;

        // Simulate call from an authorized RVM ID (deployer in this unit test context)
        await expect(
            feedProxy.connect(deployer).updatePrice(
                deployer.address, // _rvmId parameter (will be the RVM ID of the bridge)
                newRoundId,
                newAnswer,
                newStartedAt,
                newUpdatedAt,
                newAnsweredInRound
            )
        )
        .to.emit(feedProxy, "AnswerUpdated")
        .withArgs(newAnswer, newRoundId, newUpdatedAt)
        .and.to.emit(feedProxy, "NewRound")
        .withArgs(newRoundId, deployer.address, newStartedAt); // deployer.address is the 'sender' in this unit test

        const latestData = await feedProxy.latestRoundData();
        expect(latestData.roundId).to.equal(newRoundId);
        expect(latestData.answer).to.equal(newAnswer);
        expect(latestData.updatedAt).to.equal(newUpdatedAt);
    });

    it("Should revert updatePrice if called by an unauthorized RVM ID", async function () {
        const unauthorizedSigner = (await ethers.getSigners())[1]; // Get another signer
        const newRoundId = 1;
        const newAnswer = 3000000000000n;
        const newStartedAt = (await ethers.provider.getBlock("latest")).timestamp;
        const newUpdatedAt = newStartedAt + 60;
        const newAnsweredInRound = 1;

        await expect(
            feedProxy.connect(unauthorizedSigner).updatePrice(
                unauthorizedSigner.address, // Simulating unauthorized RVM ID
                newRoundId,
                newAnswer,
                newStartedAt,
                newUpdatedAt,
                newAnsweredInRound
            )
        ).to.be.revertedWith("Authorized sender only"); // Corrected expected revert message
    });

    it("Should revert on stale round update in updatePrice", async function () {
        // First valid update
        await feedProxy.connect(deployer).updatePrice(deployer.address, 1, 3000000000000n, 1000, 1000, 1);

        // Attempt stale update with same roundId
        await expect(
            feedProxy.connect(deployer).updatePrice(deployer.address, 1, 3001000000000n, 1001, 1001, 1)
        ).to.be.revertedWith("Stale round");
    });

    it("Should prune old history when maxHistory is exceeded", async function () {
        const testMaxHistory = 2; // Set maxHistory to a small number for testing
        const ChainlinkFeedProxyFactory = await ethers.getContractFactory("ChainlinkFeedProxy");
        const testFeedProxy = await ChainlinkFeedProxyFactory.deploy(
            callbackProxyAddress,
            sourceAggregatorAddress,
            DEFAULT_DECIMALS,
            DEFAULT_DESCRIPTION,
            testMaxHistory, // Use custom maxHistory
            { value: ethers.parseEther("0.005") }
        );
        await testFeedProxy.waitForDeployment();

        // Update 1 (roundId 1)
        await testFeedProxy.connect(deployer).updatePrice(deployer.address, 1, 100n, 1000, 1000, 1);
        // Update 2 (roundId 2)
        await testFeedProxy.connect(deployer).updatePrice(deployer.address, 2, 200n, 1001, 1001, 2);
        // Update 3 (roundId 3) - should prune roundId 1
        await testFeedProxy.connect(deployer).updatePrice(deployer.address, 3, 300n, 1002, 1002, 3);

        // Round 1 should be pruned (not available)
        await expect(testFeedProxy.getRoundData(1)).to.be.revertedWith("Round data not available");
        // Rounds 2 and 3 should be available
        expect((await testFeedProxy.getRoundData(2)).answer).to.equal(200n);
        expect((await testFeedProxy.getRoundData(3)).answer).to.equal(300n);
    });

    // --- Query Functions Tests ---
    it("Should return correct latest round data", async function () {
        await expect(feedProxy.latestRoundData()).to.be.revertedWith("No data present"); // Initially no data

        await feedProxy.connect(deployer).updatePrice(deployer.address, 1, 3000000000000n, 1000, 1000, 1);
        const latestData = await feedProxy.latestRoundData();
        expect(latestData.roundId).to.equal(1);
        expect(latestData.answer).to.equal(3000000000000n);
    });

    it("Should return correct specific round data", async function () {
        await feedProxy.connect(deployer).updatePrice(deployer.address, 1, 100n, 1000, 1000, 1);
        await feedProxy.connect(deployer).updatePrice(deployer.address, 2, 200n, 1001, 1001, 2);

        const round1Data = await feedProxy.getRoundData(1);
        expect(round1Data.answer).to.equal(100n);
        const round2Data = await feedProxy.getRoundData(2);
        expect(round2Data.answer).to.equal(200n);
    });

    it("Should return correct historical data between rounds", async function () {
        await feedProxy.connect(deployer).updatePrice(deployer.address, 1, 100n, 1000, 1000, 1);
        await feedProxy.connect(deployer).updatePrice(deployer.address, 2, 200n, 1001, 1001, 2);
        await feedProxy.connect(deployer).updatePrice(deployer.address, 3, 300n, 1002, 1002, 3);

        const historicalData = await feedProxy.getRoundDataBetween(1, 3);
        expect(historicalData.length).to.equal(3);
        expect(historicalData[0].answer).to.equal(100n);
        expect(historicalData[1].answer).to.equal(200n);
        expect(historicalData[2].answer).to.equal(300n);
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainlinkReactiveBridge Unit Tests", function () {
    let deployer;
    let bridge;
    let mockAggregator; // To simulate a Chainlink Aggregator address
    let mockFeedProxy; // To simulate a FeedProxy address
    let reactiveNetworkChainId; // The chain ID for Reactive Lasna

    const SEPOLIA_CHAIN_ID = 11155111;
    const REACTIVE_LASNA_CHAIN_ID = 5318007; // Actual Reactive Lasna Chain ID
    const ANSWER_UPDATED_TOPIC_0 = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";
    const CALLBACK_GAS_LIMIT = 1000000; // Define locally to match contract's private constant

    // Function selectors (Method IDs) for the functions called in callbacks
    const updatePriceSelector = ethers.id("updatePrice(address,uint80,int256,uint256,uint256,uint80)").substring(0, 10);
    const updateBridgeInternalStateSelector = ethers.id("updateBridgeInternalState(address,address,uint256,int256,uint256)").substring(0, 10);

    beforeEach(async function () {
        [deployer] = await ethers.getSigners();
        mockAggregator = ethers.Wallet.createRandom().address;
        mockFeedProxy = ethers.Wallet.createRandom().address;
        reactiveNetworkChainId = REACTIVE_LASNA_CHAIN_ID;

        const ChainlinkReactiveBridgeFactory = await ethers.getContractFactory("ChainlinkReactiveBridge");
        bridge = await ChainlinkReactiveBridgeFactory.deploy(
            SEPOLIA_CHAIN_ID,
            SEPOLIA_CHAIN_ID, // Destination is also Sepolia for this project
            reactiveNetworkChainId,
            [mockAggregator],
            [mockFeedProxy],
            [8],
            ["Test / USD"],
            { value: ethers.parseEther("0.1") } // Initial funding for the bridge
        );
        await bridge.waitForDeployment();
    });

    // --- Constructor Tests ---
    it("Should deploy with correct initial state", async function () {
        expect(await bridge.originChainId()).to.equal(SEPOLIA_CHAIN_ID);
        expect(await bridge.destinationChainId()).to.equal(SEPOLIA_CHAIN_ID);
        expect(await bridge.reactiveNetworkChainId()).to.equal(REACTIVE_LASNA_CHAIN_ID);
        expect(await bridge.monitoredAggregatorsLength()).to.equal(1);
        expect(await bridge.monitoredAggregators(0)).to.equal(mockAggregator);
        expect(await bridge.aggregatorToFeedProxy(mockAggregator)).to.equal(mockFeedProxy);
        expect(await ethers.provider.getBalance(await bridge.getAddress())).to.equal(ethers.parseEther("0.1"));
    });

    it("Should revert if aggregator and proxy array lengths mismatch", async function () {
        const ChainlinkReactiveBridgeFactory = await ethers.getContractFactory("ChainlinkReactiveBridge");
        await expect(
            ChainlinkReactiveBridgeFactory.deploy(
                SEPOLIA_CHAIN_ID,
                SEPOLIA_CHAIN_ID,
                reactiveNetworkChainId,
                [mockAggregator],
                [], // Mismatch here
                [8],
                ["Test / USD"],
                { value: ethers.parseEther("0.1") }
            )
        ).to.be.revertedWith("Aggregators and proxies mismatch");
    });

    // --- updateBridgeInternalState() Function Tests ---
    it("Should update bridge internal state correctly when called by authorized RVM ID", async function () {
        const newUpdatedAt = (await ethers.provider.getBlock("latest")).timestamp + 100;
        const newAnswer = 9876543210n; // Example price
        const newRoundId = 5;

        // Simulate call from the RVM ID (deployer's address in this unit test context)
        await bridge.connect(deployer).updateBridgeInternalState(
            deployer.address, // _rvmId
            mockAggregator,
            newUpdatedAt,
            newAnswer,
            newRoundId
        );

        expect(await bridge.lastUpdateTimestampForAggregator(mockAggregator)).to.equal(newUpdatedAt);
        expect(await bridge.lastAnswerForAggregator(mockAggregator)).to.equal(newAnswer);
        expect(await bridge.updateCountForAggregator(mockAggregator)).to.equal(1);
    });

    it("Should not update bridge internal state with stale timestamp", async function () {
        const firstUpdatedAt = (await ethers.provider.getBlock("latest")).timestamp + 100;
        const firstAnswer = 100n;
        const firstRoundId = 1;

        await bridge.connect(deployer).updateBridgeInternalState(
            deployer.address,
            mockAggregator,
            firstUpdatedAt,
            firstAnswer,
            firstRoundId
        );

        // Attempt update with older timestamp
        const staleUpdatedAt = firstUpdatedAt - 10;
        const staleAnswer = 90n;
        const staleRoundId = 2; // Even if roundId is newer, timestamp is older

        await bridge.connect(deployer).updateBridgeInternalState(
            deployer.address,
            mockAggregator,
            staleUpdatedAt,
            staleAnswer,
            staleRoundId
        );
        // State should remain as the first update
        expect(await bridge.lastUpdateTimestampForAggregator(mockAggregator)).to.equal(firstUpdatedAt);
        expect(await bridge.lastAnswerForAggregator(mockAggregator)).to.equal(firstAnswer);
        expect(await bridge.updateCountForAggregator(mockAggregator)).to.equal(1);
    });

    it("Should revert updateBridgeInternalState if called by an unauthorized RVM ID", async function () {
        const unauthorizedSigner = (await ethers.getSigners())[1]; // Get another signer
        const newUpdatedAt = (await ethers.provider.getBlock("latest")).timestamp + 100;
        const newAnswer = 9876543210n;
        const newRoundId = 5;

        await expect(
            bridge.connect(unauthorizedSigner).updateBridgeInternalState(
                unauthorizedSigner.address, // Simulating unauthorized RVM ID
                mockAggregator,
                newUpdatedAt,
                newAnswer,
                newRoundId
            )
        ).to.be.revertedWith("Authorized RVM ID only");
    });

    // --- react() Function Tests ---
    it("Should emit two callbacks (to FeedProxy and self) when react() is triggered by an event", async function () {
        const currentTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 50;
        const currentAnswer = 9000000000000n;
        const currentRoundId = 100;

        const logRecord = {
            chain_id: SEPOLIA_CHAIN_ID,
            _contract: mockAggregator,
            topic_0: ANSWER_UPDATED_TOPIC_0,
            topic_1: currentAnswer,
            topic_2: currentRoundId,
            topic_3: 0,
            data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [currentTimestamp]),
            block_number: 123,
            op_code: 3,
            block_hash: ethers.hexlify(ethers.randomBytes(32)),
            tx_hash: ethers.hexlify(ethers.randomBytes(32)),
            log_index: 0
        };

        // Expected payload for updatePrice (includes function selector)
        const expectedPayloadToFeedProxy = updatePriceSelector + ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint80", "int256", "uint256", "uint256", "uint80"],
            [ethers.ZeroAddress, currentRoundId, currentAnswer, currentTimestamp, currentTimestamp, currentRoundId]
        ).substring(2); // .substring(2) removes the "0x" prefix

        // Expected payload for updateBridgeInternalState (includes function selector)
        const expectedSelfPayload = updateBridgeInternalStateSelector + ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256", "int256", "uint256"],
            [ethers.ZeroAddress, mockAggregator, currentTimestamp, currentAnswer, currentRoundId]
        ).substring(2); // .substring(2) removes the "0x" prefix

        await expect(bridge.react(logRecord))
            .to.emit(bridge, "Callback") // First callback to FeedProxy
            .withArgs(
                SEPOLIA_CHAIN_ID,
                mockFeedProxy,
                CALLBACK_GAS_LIMIT,
                expectedPayloadToFeedProxy
            )
            .and.to.emit(bridge, "Callback") // Second callback to self (updateBridgeInternalState)
            .withArgs(
                REACTIVE_LASNA_CHAIN_ID,
                await bridge.getAddress(), // Target is bridge itself
                CALLBACK_GAS_LIMIT,
                expectedSelfPayload
            );
    });
});

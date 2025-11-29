const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting TestChainlinkEmitter deployment on Sepolia...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance (Sepolia):", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    const TestChainlinkEmitterFactory = await hre.ethers.getContractFactory("TestChainlinkEmitter", deployer);
    const emitter = await TestChainlinkEmitterFactory.deploy();
    await emitter.waitForDeployment();
    const emitterAddress = await emitter.getAddress();

    console.log(`✅ TestChainlinkEmitter deployed to: ${emitterAddress}`);
    console.log(`Transaction hash: ${emitter.deploymentTransaction().hash}`);
    console.log("\nWaiting for block confirmations...");

    await emitter.deploymentTransaction().wait(5); // Wait for 5 confirmations
    console.log("✅ Confirmed!\n");

    console.log("Verifying contract on Etherscan...");
    try {
        await hre.run("verify:verify", {
            address: emitterAddress,
            constructorArguments: [], // Emitter has no constructor arguments
        });
        console.log("✅ Contract verified on Etherscan\n");
    } catch (error) {
        console.log("⚠️  Verification failed:", error.message, "\n");
    }

    console.log("=".repeat(60));
    console.log("DEPLOYMENT SUMMARY - TEST CHAINLINK EMITTER");
    console.log("=".repeat(60));
    console.log("Network:", hre.network.name);
    console.log("TestChainlinkEmitter:", emitterAddress);
    console.log("Deployer:", deployer.address);
    console.log("=".repeat(60));
    console.log(`\n💾 Save this address to your .env file:`);
    console.log(`export TEST_CHAINLINK_EMITTER_ADDR=${emitterAddress}\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

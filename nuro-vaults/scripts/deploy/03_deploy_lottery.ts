import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Step 3: Deploy LotteryEngine and AaveV3Adapter.
 * Requires AdminController + SpendingCreditPool from previous steps.
 *
 * Chainlink VRF on Base Sepolia:
 *   Coordinator: 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE
 *   Key Hash:    0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897
 *
 * Chainlink VRF on Base Mainnet:
 *   Coordinator: 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634
 *   Key Hash:    0x027f94ff1465b3525f9fc03e9ff7d6d2c0953482246dd6ae0445c87f7cc7cf4c
 */

const VRF_CONFIG: Record<string, { coordinator: string; keyHash: string }> = {
  baseSepolia: {
    coordinator: "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE",
    keyHash:     "0x9e9e46732b32662b9adc6f3abdf6c5e926a666d174a4d6b8e39c4cca76a38897",
  },
  base: {
    coordinator: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
    keyHash:     "0x027f94ff1465b3525f9fc03e9ff7d6d2c0953482246dd6ae0445c87f7cc7cf4c",
  },
  hardhat: {
    coordinator: "0x0000000000000000000000000000000000000001",
    keyHash:     "0x0000000000000000000000000000000000000000000000000000000000000001",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying LotteryEngine + AaveV3Adapter on ${network.name}`);
  console.log(`Deployer: ${deployer.address}\n`);

  const deployments = loadDeployments(network.name);
  const adminAddress     = deployments["AdminController"];
  const creditPoolAddress = deployments["SpendingCreditPool"];
  const yieldRouterAddress = deployments["YieldRouter"];

  if (!adminAddress || !creditPoolAddress)
    throw new Error("Missing prior deployments. Run 01 and 02 first.");

  const vrf = VRF_CONFIG[network.name] || VRF_CONFIG.baseSepolia;
  const SUBSCRIPTION_ID = process.env.CHAINLINK_VRF_SUBSCRIPTION_ID || "1";

  // LotteryEngine
  console.log("Deploying LotteryEngine...");
  const LotteryEngine = await ethers.getContractFactory("LotteryEngine");
  const lottery = await LotteryEngine.deploy(
    adminAddress,
    creditPoolAddress,
    vrf.coordinator,
    BigInt(SUBSCRIPTION_ID),
    vrf.keyHash
  );
  await lottery.deployed();
  console.log(`LotteryEngine: ${lottery.address}`);
  saveDeployment(network.name, "LotteryEngine", lottery.address);

  // Wire LotteryEngine into SpendingCreditPool
  const creditPool = await ethers.getContractAt("SpendingCreditPool", creditPoolAddress);
  await creditPool.setLotteryEngine(lottery.address);
  console.log("SpendingCreditPool.lotteryEngine set");

  // AaveV3Adapter
  if (yieldRouterAddress) {
    console.log("\nDeploying AaveV3Adapter...");
    const AaveV3Adapter = await ethers.getContractFactory("AaveV3Adapter");
    const aaveAdapter = await AaveV3Adapter.deploy(yieldRouterAddress);
    await aaveAdapter.deployed();
    console.log(`AaveV3Adapter: ${aaveAdapter.address}`);
    saveDeployment(network.name, "AaveV3Adapter", aaveAdapter.address);

    // Register strategy with YieldRouter
    const yieldRouter = await ethers.getContractAt("YieldRouter", yieldRouterAddress);
    const strategyId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("AAVE_V3_USDC"));
    await yieldRouter.registerStrategy(strategyId, aaveAdapter.address);
    console.log("AaveV3Adapter registered with YieldRouter (id: AAVE_V3_USDC)");
    saveDeployment(network.name, "STRATEGY_ID_AAVE_V3", strategyId);
  }

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await lottery.deployTransaction.wait(5);
    try {
      await run("verify:verify", {
        address: lottery.address,
        constructorArguments: [adminAddress, creditPoolAddress, vrf.coordinator, BigInt(SUBSCRIPTION_ID), vrf.keyHash],
      });
    } catch (e: any) { console.warn("Verification:", e.message); }
  }

  console.log("\nAll contracts deployed. Deployment addresses saved to deployments/");
  console.log("\nFINAL DEPLOYMENT SUMMARY:");
  console.log(JSON.stringify(loadDeployments(network.name), null, 2));
}

function loadDeployments(net: string): Record<string, string> {
  const file = path.join(__dirname, `../../deployments/${net}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function saveDeployment(net: string, name: string, address: string) {
  const dir = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${net}.json`);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  existing[name] = address;
  existing["_timestamp"] = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

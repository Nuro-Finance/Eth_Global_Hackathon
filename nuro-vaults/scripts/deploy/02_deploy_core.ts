import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Step 2: Deploy all core contracts.
 * Requires AdminController from step 01 to be deployed first.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying core contracts on ${network.name}`);
  console.log(`Deployer: ${deployer.address}\n`);

  const deployments = loadDeployments(network.name);
  const adminAddress = deployments["AdminController"];
  if (!adminAddress) throw new Error("AdminController not found in deployments. Run 01_deploy_admin.ts first.");
  console.log(`Using AdminController: ${adminAddress}\n`);

  // 1. VaultRegistry
  console.log("Deploying VaultRegistry...");
  const VaultRegistry = await ethers.getContractFactory("VaultRegistry");
  const vaultRegistry = await VaultRegistry.deploy(adminAddress);
  await vaultRegistry.deployed();
  console.log(`VaultRegistry: ${vaultRegistry.address}`);
  saveDeployment(network.name, "VaultRegistry", vaultRegistry.address);

  // 2. FeeRouter
  console.log("Deploying FeeRouter...");
  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(adminAddress, vaultRegistry.address);
  await feeRouter.deployed();
  console.log(`FeeRouter: ${feeRouter.address}`);
  saveDeployment(network.name, "FeeRouter", feeRouter.address);

  // 3. CompetitionEngine
  console.log("Deploying CompetitionEngine...");
  const CompetitionEngine = await ethers.getContractFactory("CompetitionEngine");
  const competitionEngine = await CompetitionEngine.deploy(adminAddress, vaultRegistry.address, feeRouter.address);
  await competitionEngine.deployed();
  console.log(`CompetitionEngine: ${competitionEngine.address}`);
  saveDeployment(network.name, "CompetitionEngine", competitionEngine.address);

  // 4. YieldRouter
  console.log("Deploying YieldRouter...");
  const YieldRouter = await ethers.getContractFactory("YieldRouter");
  const yieldRouter = await YieldRouter.deploy(adminAddress);
  await yieldRouter.deployed();
  console.log(`YieldRouter: ${yieldRouter.address}`);
  saveDeployment(network.name, "YieldRouter", yieldRouter.address);

  // 5. SpendingCreditPool
  console.log("Deploying SpendingCreditPool...");
  const SpendingCreditPool = await ethers.getContractFactory("SpendingCreditPool");
  const creditPool = await SpendingCreditPool.deploy(adminAddress);
  await creditPool.deployed();
  console.log(`SpendingCreditPool: ${creditPool.address}`);
  saveDeployment(network.name, "SpendingCreditPool", creditPool.address);

  // Wire cross-references
  console.log("\nWiring contract cross-references...");
  await vaultRegistry.setFeeRouter(feeRouter.address);
  console.log("  VaultRegistry.feeRouter set");
  await feeRouter.setCompetitionEngine(competitionEngine.address);
  console.log("  FeeRouter.competitionEngine set");
  await yieldRouter.setCompetitionEngine(competitionEngine.address);
  console.log("  YieldRouter.competitionEngine set");
  await creditPool.setCompetitionEngine(competitionEngine.address);
  console.log("  SpendingCreditPool.competitionEngine set");

  // Register default vaults (chains + reserve)
  console.log("\nRegistering default chain vaults...");
  const chains = [
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BASE")),      name: "Base",      type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ETHEREUM")),  name: "Ethereum",  type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ARBITRUM")),  name: "Arbitrum",  type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("OPTIMISM")),  name: "Optimism",  type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POLYGON")),   name: "Polygon",   type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("AVALANCHE")), name: "Avalanche", type: 1 },
    { id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BSC")),       name: "BSC",       type: 1 },
  ];
  for (const chain of chains) {
    await vaultRegistry.registerVault(chain.id, chain.name, chain.type);
    console.log(`  Registered chain vault: ${chain.name}`);
  }
  const reserveId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RESERVE"));
  await vaultRegistry.registerVault(reserveId, "Reserve", 2);
  console.log("  Registered Reserve vault");

  // Basescan verification
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting for block confirmations before verification...");
    await creditPool.deployTransaction.wait(5);
    const toVerify = [
      { name: "VaultRegistry",     address: vaultRegistry.address,     args: [adminAddress] },
      { name: "FeeRouter",         address: feeRouter.address,         args: [adminAddress, vaultRegistry.address] },
      { name: "CompetitionEngine", address: competitionEngine.address, args: [adminAddress, vaultRegistry.address, feeRouter.address] },
      { name: "YieldRouter",       address: yieldRouter.address,       args: [adminAddress] },
      { name: "SpendingCreditPool",address: creditPool.address,        args: [adminAddress] },
    ];
    for (const v of toVerify) {
      try {
        await run("verify:verify", { address: v.address, constructorArguments: v.args });
        console.log(`Verified ${v.name}`);
      } catch (e: any) {
        console.warn(`Verification skipped for ${v.name}: ${e.message}`);
      }
    }
  }

  console.log("\nStep 2 complete. Run 03_deploy_lottery.ts next.");
}

function loadDeployments(network: string): Record<string, string> {
  const file = path.join(__dirname, `../../deployments/${network}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function saveDeployment(network: string, name: string, address: string) {
  const dir = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network}.json`);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  existing[name] = address;
  existing["_timestamp"] = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

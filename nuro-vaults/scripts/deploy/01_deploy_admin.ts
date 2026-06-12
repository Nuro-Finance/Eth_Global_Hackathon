import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Step 1: Deploy AdminController
 * This must be deployed first. All other contracts depend on it.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying AdminController on ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.utils.formatEther(await deployer.getBalance())} ETH\n`);

  const MULTISIG = process.env.CASHLY_MULTISIG || "0x749edFC84A28793ce150d4E7E71bcEe73C454b56";

  const AdminController = await ethers.getContractFactory("AdminController");
  const admin = await AdminController.deploy(MULTISIG, deployer.address);
  await admin.deployed();
  console.log(`AdminController deployed: ${admin.address}`);

  // Save address to deployments file
  saveDeployment(network.name, "AdminController", admin.address);

  // Verify on Basescan (skip on local)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting 5 confirmations before verification...");
    await admin.deployTransaction.wait(5);
    try {
      await run("verify:verify", {
        address: admin.address,
        constructorArguments: [MULTISIG, deployer.address],
      });
      console.log("Verified on Basescan.");
    } catch (e: any) {
      console.warn("Verification failed (may already be verified):", e.message);
    }
  }

  console.log("\nStep 1 complete. Run 02_deploy_vault_registry.ts next.");
}

function saveDeployment(network: string, name: string, address: string) {
  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network}.json`);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  existing[name] = address;
  existing["_timestamp"] = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`  Saved to deployments/${network}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Deploying ARC-402 contracts to", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. PolicyEngine
  const PolicyEngine = await hre.ethers.getContractFactory("PolicyEngine");
  const policyEngine = await PolicyEngine.deploy();
  await policyEngine.waitForDeployment();
  console.log("PolicyEngine:", await policyEngine.getAddress());

  // 2. TrustRegistry
  const TrustRegistry = await hre.ethers.getContractFactory("TrustRegistry");
  const trustRegistry = await TrustRegistry.deploy();
  await trustRegistry.waitForDeployment();
  console.log("TrustRegistry:", await trustRegistry.getAddress());

  // 3. IntentAttestation
  const IntentAttestation = await hre.ethers.getContractFactory("IntentAttestation");
  const intentAttestation = await IntentAttestation.deploy();
  await intentAttestation.waitForDeployment();
  console.log("IntentAttestation:", await intentAttestation.getAddress());

  // 4. SettlementCoordinator
  const SettlementCoordinator = await hre.ethers.getContractFactory("SettlementCoordinator");
  const settlementCoordinator = await SettlementCoordinator.deploy();
  await settlementCoordinator.waitForDeployment();
  console.log("SettlementCoordinator:", await settlementCoordinator.getAddress());

  // 5. ARC402Wallet (example instance)
  const ARC402Wallet = await hre.ethers.getContractFactory("ARC402Wallet");
  const wallet = await ARC402Wallet.deploy(
    await policyEngine.getAddress(),
    await trustRegistry.getAddress(),
    await intentAttestation.getAddress()
  );
  await wallet.waitForDeployment();
  console.log("ARC402Wallet (example):", await wallet.getAddress());

  // Wire: add wallet as trust updater
  await trustRegistry.addUpdater(await wallet.getAddress());
  console.log("TrustRegistry: wallet added as updater");

  // Save addresses
  const addresses = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      PolicyEngine: await policyEngine.getAddress(),
      TrustRegistry: await trustRegistry.getAddress(),
      IntentAttestation: await intentAttestation.getAddress(),
      SettlementCoordinator: await settlementCoordinator.getAddress(),
      ARC402Wallet: await wallet.getAddress(),
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const outPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

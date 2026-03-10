/**
 * ARC-402 Demo: Insurance Claims Agent
 *
 * Scenario: An insurance claims agent (Agent A) needs to look up medical records
 * for claim #4821. It opens a "claims_processing" context, creates an intent
 * attestation explaining why it needs the data, pays a medical records provider
 * (simulated address), closes the context. Trust score updates.
 */

import hre from "hardhat";

async function main() {
  console.log("=".repeat(60));
  console.log("ARC-402 Demo: Insurance Claims Agent");
  console.log("=".repeat(60));

  const [deployer, medicalProvider] = await hre.ethers.getSigners();

  console.log("\n[DEPLOY] Deploying ARC-402 contracts...");

  const PolicyEngineFactory = await hre.ethers.getContractFactory("PolicyEngine");
  const policyEngine = await PolicyEngineFactory.deploy();
  await policyEngine.waitForDeployment();

  const TrustRegistryFactory = await hre.ethers.getContractFactory("TrustRegistry");
  const trustRegistry = await TrustRegistryFactory.deploy();
  await trustRegistry.waitForDeployment();

  const IntentAttestationFactory = await hre.ethers.getContractFactory("IntentAttestation");
  const intentAttestation = await IntentAttestationFactory.deploy();
  await intentAttestation.waitForDeployment();

  const WalletFactory = await hre.ethers.getContractFactory("ARC402Wallet");
  const wallet = await WalletFactory.deploy(
    await policyEngine.getAddress(),
    await trustRegistry.getAddress(),
    await intentAttestation.getAddress()
  );
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();

  await trustRegistry.addUpdater(walletAddress);

  console.log(`  PolicyEngine:      ${await policyEngine.getAddress()}`);
  console.log(`  TrustRegistry:     ${await trustRegistry.getAddress()}`);
  console.log(`  IntentAttestation: ${await intentAttestation.getAddress()}`);
  console.log(`  Agent Wallet:      ${walletAddress}`);

  console.log("\n[PRIMITIVE 1: POLICY OBJECT]");

  await policyEngine.setCategoryLimitFor(
    walletAddress, "claims_processing", hre.ethers.parseEther("0.05")
  );
  await policyEngine.setCategoryLimitFor(
    walletAddress, "data", hre.ethers.parseEther("0.01")
  );

  console.log("  claims_processing limit: 0.05 ETH per tx");
  console.log("  data limit:              0.01 ETH per tx");

  await deployer.sendTransaction({ to: walletAddress, value: hre.ethers.parseEther("1") });
  console.log("  Wallet funded with 1 ETH");

  console.log("\n[PRIMITIVE 3: TRUST PRIMITIVE]");
  const initialScore = await wallet.getTrustScore();
  console.log(`  Initial trust score: ${initialScore} (level: restricted)`);

  console.log("\n[PRIMITIVE 2: CONTEXT BINDING]");
  const contextId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`claims_processing:claim-4821:${Date.now()}`)
  );
  await wallet.openContext(contextId, "claims_processing");
  console.log(`  Context ID: ${contextId}`);
  console.log("  Task type: claims_processing");

  console.log("\n[PRIMITIVE 4: INTENT ATTESTATION]");

  const attestationId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`attest:claim-4821:medical-records:${Date.now()}`)
  );

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [walletAddress],
  });
  await hre.network.provider.send("hardhat_setBalance", [walletAddress, "0x1000000000000000000"]);
  const walletSigner = await hre.ethers.getSigner(walletAddress);
  await intentAttestation.connect(walletSigner).attest(
    attestationId,
    "request_medical_records",
    "Insurance claim #4821: patient Jane Smith, date of service 2026-01-15. Requires medical records to validate claim.",
    medicalProvider.address,
    hre.ethers.parseEther("0.01")
  );
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [walletAddress],
  });

  console.log(`  Attestation ID: ${attestationId}`);
  console.log("  Action: request_medical_records");
  console.log("  [Intent permanently recorded on-chain]");

  console.log("\n[SPEND EXECUTION]");
  const providerBalBefore = await hre.ethers.provider.getBalance(medicalProvider.address);
  await wallet.executeSpend(
    medicalProvider.address,
    hre.ethers.parseEther("0.01"),
    "claims_processing",
    attestationId
  );
  const providerBalAfter = await hre.ethers.provider.getBalance(medicalProvider.address);
  console.log(`  Payment sent: ${hre.ethers.formatEther(providerBalAfter - providerBalBefore)} ETH`);

  console.log("\n[CONTEXT CLOSE + TRUST UPDATE]");
  await wallet.closeContext();
  const finalScore = await wallet.getTrustScore();
  console.log(`  Trust score: ${initialScore} -> ${finalScore} (+5 for successful context)`);

  console.log("\n" + "=".repeat(60));
  console.log("Demo complete.");
  console.log("=".repeat(60));
}

main().catch(console.error);

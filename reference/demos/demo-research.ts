/**
 * ARC-402 Demo: Research Agent
 *
 * Scenario: A research agent is executing an autonomous research task.
 * It opens a "research" context, makes 3 sequential payments to different
 * data providers (each with its own intent attestation), closes the context.
 * Demonstrates context-aware spending limits: research category has a different
 * limit than claims_processing.
 */

import hre from "hardhat";

async function main() {
  console.log("=".repeat(60));
  console.log("ARC-402 Demo: Research Agent (Multi-Payment Context)");
  console.log("=".repeat(60));

  const [deployer, provider1, provider2, provider3] = await hre.ethers.getSigners();

  // ─── Deploy ───────────────────────────────────────────────────────
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
  await deployer.sendTransaction({
    to: walletAddress,
    value: hre.ethers.parseEther("5"),
  });

  console.log(`  Agent Wallet: ${walletAddress}`);

  // ─── Primitive 1: Policy Object ──────────────────────────────────
  console.log("\n[PRIMITIVE 1: POLICY OBJECT]");
  console.log("Configuring category-specific limits:");

  await policyEngine.setCategoryLimitFor(
    walletAddress,
    "research",
    hre.ethers.parseEther("0.1")   // 0.1 ETH per tx for research
  );
  await policyEngine.setCategoryLimitFor(
    walletAddress,
    "claims_processing",
    hre.ethers.parseEther("0.05")  // 0.05 ETH for claims (different limit)
  );
  await policyEngine.setCategoryLimitFor(
    walletAddress,
    "data",
    hre.ethers.parseEther("0.02")  // 0.02 ETH for raw data
  );

  console.log("  research limit:          0.1 ETH per tx");
  console.log("  claims_processing limit: 0.05 ETH per tx");
  console.log("  data limit:              0.02 ETH per tx");
  console.log("");
  console.log("  NOTE: research category has 2x the limit of claims_processing");
  console.log("  Context-aware limits prevent overspending in wrong task type");

  // ─── Primitive 2: Context Binding ────────────────────────────────
  console.log("\n[PRIMITIVE 2: CONTEXT BINDING]");
  const taskId = `research-task-${Date.now()}`;
  const contextId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(taskId));
  await wallet.openContext(contextId, "research");

  console.log(`  Context opened: ${taskId}`);
  console.log("  Task type: research");
  console.log("  All 3 payments will be validated against this context");

  // ─── Primitive 3: Trust Primitive ────────────────────────────────
  console.log("\n[PRIMITIVE 3: TRUST PRIMITIVE]");
  const scoreStart = await wallet.getTrustScore();
  console.log(`  Trust score at context open: ${scoreStart}`);

  // Helper: set balance for wallet impersonation
  await hre.network.provider.send("hardhat_setBalance", [
    walletAddress,
    "0x10000000000000000000",
  ]);

  const pays = [
    {
      provider: provider1,
      name: "ArXiv API",
      action: "fetch_research_papers",
      reason: "Fetching recent papers on LLM agent architecture for autonomous research task",
      amount: hre.ethers.parseEther("0.02"),
      category: "research",
    },
    {
      provider: provider2,
      name: "Semantic Scholar",
      action: "fetch_citation_graph",
      reason: "Retrieving citation graph for cross-referencing key papers on agent memory",
      amount: hre.ethers.parseEther("0.05"),
      category: "research",
    },
    {
      provider: provider3,
      name: "DataVault API",
      action: "purchase_dataset",
      reason: "Purchasing benchmark dataset to evaluate agent performance claims in literature",
      amount: hre.ethers.parseEther("0.08"),
      category: "research",
    },
  ];

  for (let i = 0; i < pays.length; i++) {
    const { provider, name, action, reason, amount, category } = pays[i];
    console.log(`\n[PAYMENT ${i + 1}/3: ${name}]`);

    // ─── Primitive 4: Intent Attestation ─────────────────────────
    console.log(`  [PRIMITIVE 4: INTENT ATTESTATION]`);
    const attestationId = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(`${action}:${i}:${Date.now()}`)
    );

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [walletAddress],
    });
    const walletSigner = await hre.ethers.getSigner(walletAddress);
    await intentAttestation.connect(walletSigner).attest(
      attestationId,
      action,
      reason,
      provider.address,
      amount
    );
    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [walletAddress],
    });

    console.log(`  Action: ${action}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Amount: ${hre.ethers.formatEther(amount)} ETH`);

    // ─── Execute Spend ────────────────────────────────────────────
    const balBefore = await hre.ethers.provider.getBalance(provider.address);
    await wallet.executeSpend(provider.address, amount, category, attestationId);
    const balAfter = await hre.ethers.provider.getBalance(provider.address);

    console.log(`  Policy check: PASSED (${hre.ethers.formatEther(amount)} <= 0.1 ETH limit)`);
    console.log(`  Payment sent: ${hre.ethers.formatEther(balAfter - balBefore)} ETH to ${name}`);
  }

  // ─── Close Context ────────────────────────────────────────────────
  console.log("\n[CONTEXT CLOSE + TRUST UPDATE]");
  await wallet.closeContext();
  const scoreEnd = await wallet.getTrustScore();

  console.log(`  Context closed: 3 payments executed successfully`);
  console.log(`  Trust score: ${scoreStart} -> ${scoreEnd} (+5 for successful context)`);

  console.log("\n" + "=".repeat(60));
  console.log("Demo complete. ARC-402 primitives demonstrated:");
  console.log("  [OK] Policy Object     — different limits per category");
  console.log("  [OK] Context Binding   — all 3 pays scoped to research context");
  console.log("  [OK] Trust Primitive   — score updated after 3-pay context");
  console.log("  [OK] Intent Attestation — unique WHY for each payment");
  console.log("=".repeat(60));
}

main().catch(console.error);

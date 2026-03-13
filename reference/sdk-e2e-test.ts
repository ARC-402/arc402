import { ethers } from "ethers";
import {
  ServiceAgreementClient,
  TrustClient,
  AgentRegistryClient,
  PolicyClient,
  ARC402WalletClient,
  ReputationOracleClient,
} from "./sdk/src/index";

const RPC = "https://sepolia.base.org";
const SA_ADDR = "0xa214d30906a934358f451514da1ba732ad79f158";
const TR_ADDR = "0xbd3f2f15f794fde8b3a59b6643e4b7e985ee1389"; // SA-dedicated TrustRegistry
const TR_V2_ADDR = "0xfCc2CDC42654e05Dad5F6734cE5caFf3dAE0E94F"; // TrustRegistryV2
const AR_ADDR = "0x07D526f8A8e148570509aFa249EFF295045A0cc9";
const PE_ADDR = "0x44102e70c2A366632d98Fe40d892a2501fC7fFF2";
const REP_ADDR = "0x410e650113fd163389C956BC7fC51c5642617187";
const DEPLOYER = "0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB";

const provider = new ethers.JsonRpcProvider(RPC);

let pass = 0;
let fail = 0;

function ok(label: string, detail: string) {
  console.log(`PASS: ${label} — ${detail}`);
  pass++;
}

function bad(label: string, err: unknown) {
  console.log(`FAIL: ${label} — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  fail++;
}

async function main() {
  // E-0: basic RPC
  try {
    const block = await provider.getBlockNumber();
    ok("E-0 RPC connect", `block ${block}`);
  } catch (e) { bad("E-0 RPC connect", e); }

  // E-1: agreement.ts — getAgreement(1)
  try {
    const sa = new ServiceAgreementClient(SA_ADDR, provider);
    const ag = await sa.getAgreement(1n);
    const statusNames = ["PROPOSED","ACCEPTED","DELIVERED","FULFILLED","DISPUTED","CANCELLED","EXPIRED","ESCALATED_TO_HUMAN","REMEDIATION","REMEDIATION_COMPLETE","COMMITTED","PENDING_VERIFY"];
    const statusStr = statusNames[ag.status] ?? `status=${ag.status}`;
    if (ag.status === 3) {
      ok("E-1 agreement.getAgreement(1)", `status=${statusStr}, price=${ethers.formatEther(ag.price)} ETH`);
    } else {
      bad("E-1 agreement.getAgreement(1)", `expected FULFILLED(3), got ${statusStr}(${ag.status})`);
    }
  } catch (e) { bad("E-1 agreement.getAgreement(1)", e); }

  // E-1b: getProviderAgreements
  try {
    const sa = new ServiceAgreementClient(SA_ADDR, provider);
    const agreements = await sa.getProviderAgreements(DEPLOYER);
    ok("E-1b agreement.getProviderAgreements", `${agreements.length} agreements for deployer`);
  } catch (e) { bad("E-1b agreement.getProviderAgreements", e); }

  // E-2: trust.ts — getScore on SA-dedicated TrustRegistry
  try {
    const tr = new TrustClient(TR_ADDR, provider);
    const score = await tr.getScore(DEPLOYER);
    ok("E-2 trust.getScore (SA-dedicated TR)", `score=${score.score}, level=${score.level}, nextLevelAt=${score.nextLevelAt}`);
  } catch (e) { bad("E-2 trust.getScore (SA-dedicated TR)", e); }

  // E-2b: trust.ts — getScore on TrustRegistryV2
  try {
    const tr = new TrustClient(TR_V2_ADDR, provider);
    const score = await tr.getScore(DEPLOYER);
    ok("E-2b trust.getScore (TrustRegistryV2)", `score=${score.score}, level=${score.level}`);
  } catch (e) { bad("E-2b trust.getScore (TrustRegistryV2)", e); }

  // E-2c: trust.ts — getEffectiveScore on TrustRegistryV2
  try {
    const tr = new TrustClient(TR_V2_ADDR, provider);
    const score = await tr.getEffectiveScore(DEPLOYER);
    ok("E-2c trust.getEffectiveScore (TrustRegistryV2)", `score=${score.score}, level=${score.level}`);
  } catch (e) { bad("E-2c trust.getEffectiveScore (TrustRegistryV2)", e); }

  // E-3: agent.ts — getAgent for deployer (GigaBrain)
  try {
    const ar = new AgentRegistryClient(AR_ADDR, provider);
    const agent = await ar.getAgent(DEPLOYER);
    if (!agent.name) {
      bad("E-3 agent.getAgent", "agent name is empty — not registered?");
    } else {
      ok("E-3 agent.getAgent", `name="${agent.name}", active=${agent.active}, caps=[${agent.capabilities.join(",")}]`);
    }
  } catch (e) { bad("E-3 agent.getAgent", e); }

  // E-3b: agent.ts — listAgents
  try {
    const ar = new AgentRegistryClient(AR_ADDR, provider);
    const agents = await ar.listAgents(5);
    ok("E-3b agent.listAgents", `${agents.length} agents found`);
  } catch (e) { bad("E-3b agent.listAgents", e); }

  // E-3c: agent.ts — getOperationalMetrics
  try {
    const ar = new AgentRegistryClient(AR_ADDR, provider);
    const metrics = await ar.getOperationalMetrics(DEPLOYER);
    ok("E-3c agent.getOperationalMetrics", `heartbeats=${metrics.heartbeatCount}, uptime=${metrics.uptimeScore}`);
  } catch (e) { bad("E-3c agent.getOperationalMetrics", e); }

  // E-4: policy.ts — get policy for deployer
  try {
    const pc = new PolicyClient(PE_ADDR, provider);
    const policy = await pc.get(DEPLOYER);
    const cats = Object.keys(policy.categories);
    const hashStr = policy.policyHash ? policy.policyHash.slice(0, 10) + "..." : "none";
    ok("E-4 policy.get", `categories=[${cats.join(",") || "none"}], hash=${hashStr}`);
  } catch (e) { bad("E-4 policy.get", e); }

  // E-4b: policy.ts — validate a spend
  try {
    const pc = new PolicyClient(PE_ADDR, provider);
    const result = await pc.validate(DEPLOYER, "compute", 1000n);
    ok("E-4b policy.validate", `valid=${result.valid}, reason=${result.reason ?? "ok"}`);
  } catch (e) { bad("E-4b policy.validate", e); }

  // E-5: wallet.ts — ARC402WalletClient.getPolicy
  try {
    const wc = new ARC402WalletClient(DEPLOYER, provider, "base-sepolia");
    const policy = await wc.getPolicy();
    ok("E-5 wallet.getPolicy (via ARC402WalletClient)", `categories=[${Object.keys(policy.categories).join(",") || "none"}]`);
  } catch (e) { bad("E-5 wallet.getPolicy", e); }

  // E-6: reputation.ts — instantiate client
  try {
    new ReputationOracleClient(REP_ADDR, provider);
    ok("E-6 ReputationOracleClient instantiation", "client created successfully");
  } catch (e) { bad("E-6 ReputationOracleClient", e); }

  console.log(`\n--- Results: ${pass} PASS, ${fail} FAIL ---`);
}

main().catch(console.error);

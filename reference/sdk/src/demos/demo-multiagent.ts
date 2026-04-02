import { JsonRpcProvider, Wallet, ethers, ContractFactory, NonceManager } from "ethers"
import { spawn, ChildProcess } from "child_process"
import { readFileSync } from "fs"
import { join } from "path"

const FOUNDRY_BIN = process.env.HOME + "/.foundry/bin"
const PORT = 12000 + (process.pid % 10000)

let anvilProcess: ChildProcess | null = null
process.on("exit", () => { try { anvilProcess?.kill("SIGKILL") } catch {} })

async function startAnvil(): Promise<ChildProcess> {
  anvilProcess = spawn(FOUNDRY_BIN + "/anvil", ["--port", String(PORT)], { detached: false, stdio: "ignore" })
  await new Promise(r => setTimeout(r, 1500))
  return anvilProcess
}

function loadArtifact(name: string) {
  const outDir = join(__dirname, "../../../out")
  const artifact = JSON.parse(readFileSync(join(outDir, `${name}.sol`, `${name}.json`), "utf8"))
  return { abi: artifact.abi, bytecode: artifact.bytecode.object }
}

const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
]

async function deployWallet(
  owner: NonceManager,
  policyEngineAddr: string,
  trustRegistryAddr: string,
  intentAttestationAddr: string,
  trustRegistry: any,
  walletArt: any
) {
  const wallet = await (await new ContractFactory(walletArt.abi, walletArt.bytecode, owner).deploy(
    policyEngineAddr, trustRegistryAddr, intentAttestationAddr
  )).waitForDeployment()
  const addr = await wallet.getAddress()
  await (await trustRegistry.connect(owner).addUpdater(addr)).wait()
  return { wallet, addr }
}

async function main() {
  console.log("=== ARC-402 DEMO: Multi-Agent Settlement ===\n")

  const anvil = await startAnvil()

  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`)
  const deployer = new NonceManager(new Wallet(ANVIL_KEYS[0], provider))
  const orchestratorOwner = new NonceManager(new Wallet(ANVIL_KEYS[1], provider))
  const specialistOwner = new NonceManager(new Wallet(ANVIL_KEYS[2], provider))

  // Deploy shared infrastructure
  const policyArt = loadArtifact("PolicyEngine")
  const trustArt = loadArtifact("TrustRegistry")
  const intentArt = loadArtifact("IntentAttestation")
  const walletArt = loadArtifact("ARC402Wallet")
  const settlementArt = loadArtifact("SettlementCoordinator")

  const policyEngine = await (await new ContractFactory(policyArt.abi, policyArt.bytecode, deployer).deploy()).waitForDeployment()
  const trustRegistry = await (await new ContractFactory(trustArt.abi, trustArt.bytecode, deployer).deploy()).waitForDeployment()
  const intentAttestation = await (await new ContractFactory(intentArt.abi, intentArt.bytecode, deployer).deploy()).waitForDeployment()
  const settlementCoordinator = await (await new ContractFactory(settlementArt.abi, settlementArt.bytecode, deployer).deploy()).waitForDeployment()

  const peAddr = await policyEngine.getAddress()
  const trAddr = await trustRegistry.getAddress()
  const iaAddr = await intentAttestation.getAddress()
  const scAddr = await settlementCoordinator.getAddress()

  console.log("[INFRASTRUCTURE]")
  console.log(`  PolicyEngine:            ${peAddr}`)
  console.log(`  TrustRegistry:           ${trAddr}`)
  console.log(`  IntentAttestation:       ${iaAddr}`)
  console.log(`  SettlementCoordinator:   ${scAddr}\n`)

  // Deploy two wallets (using deployer as owner for both for simplicity)
  const { wallet: orchWallet, addr: orchAddr } = await deployWallet(
    deployer, peAddr, trAddr, iaAddr, trustRegistry, walletArt
  )
  const { wallet: specWallet, addr: specAddr } = await deployWallet(
    deployer, peAddr, trAddr, iaAddr, trustRegistry, walletArt
  )

  console.log("[WALLETS]")
  console.log(`  Orchestrator wallet:     ${orchAddr}`)
  console.log(`  Specialist wallet:       ${specAddr}\n`)

  // Fund orchestrator
  await (await deployer.sendTransaction({ to: orchAddr, value: ethers.parseEther("5.0") })).wait()

  // Register wallets in PolicyEngine
  const deployerAddr = await deployer.getAddress()
  await (await (policyEngine as any).connect(deployer).registerWallet(orchAddr, deployerAddr)).wait()
  await (await (policyEngine as any).connect(deployer).registerWallet(specAddr, deployerAddr)).wait()

  // Set policies for both wallets
  await (await (policyEngine as any).connect(deployer).setCategoryLimitFor(orchAddr, "specialist_fee", ethers.parseEther("1.0"))).wait()
  await (await (policyEngine as any).connect(deployer).setCategoryLimitFor(specAddr, "orchestrator_payment", ethers.parseEther("1.0"))).wait()

  console.log("[PRIMITIVE 1: POLICIES SET FOR BOTH WALLETS]")
  console.log(`  Orchestrator: specialist_fee limit = 1.0 ETH`)
  console.log(`  Specialist: orchestrator_payment limit = 1.0 ETH`)
  console.log("Policies set\n")

  // Orchestrator opens context
  console.log("[PRIMITIVE 2: ORCHESTRATOR OPENS CONTEXT]")
  const orchContextId = ethers.keccak256(ethers.toUtf8Bytes("orchestrator-task-" + Date.now()))
  await (await (orchWallet as any).connect(deployer).openContext(orchContextId, "coordinate_specialist")).wait()
  console.log(`  Context ID: ${orchContextId}`)
  console.log("Orchestrator context open\n")

  // Check trust scores
  const orchScore = await (trustRegistry as any).getScore(orchAddr)
  const specScore = await (trustRegistry as any).getScore(specAddr)
  console.log("[PRIMITIVE 3: TRUST SCORES]")
  console.log(`  Orchestrator trust: ${orchScore} (${await (trustRegistry as any).getTrustLevel(orchAddr)})`)
  console.log(`  Specialist trust:   ${specScore} (${await (trustRegistry as any).getTrustLevel(specAddr)})\n`)

  // Orchestrator creates intent attestation for settlement
  console.log("[PRIMITIVE 4: INTENT ATTESTATION]")
  const settleAmount = ethers.parseEther("0.5")
  const intentId = ethers.keccak256(ethers.toUtf8Bytes(`settle-orch-spec-${Date.now()}`))

  await provider.send("anvil_impersonateAccount", [orchAddr])
  await provider.send("anvil_setBalance", [orchAddr, "0x4563918244F40000"]) // 5 ETH
  const impOrch = await provider.getSigner(orchAddr)
  await (await (intentAttestation as any).connect(impOrch).attest(
    intentId,
    "pay_specialist",
    "Payment for data analysis task completed by specialist agent",
    specAddr,
    settleAmount
  )).wait()
  await provider.send("anvil_stopImpersonatingAccount", [orchAddr])
  console.log(`  Intent attested: ${intentId}`)
  console.log("Intent attestation created\n")

  // Propose settlement (anyone can propose)
  console.log("[SETTLEMENT FLOW]")
  const scAny = settlementCoordinator as any
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const proposeTx = await (await scAny.connect(deployer).propose(orchAddr, specAddr, settleAmount, intentId, expiresAt)).wait()

  // Extract proposalId from logs
  let proposalId = ""
  const iface = settlementCoordinator.interface
  for (const log of proposeTx.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed && parsed.name === "ProposalCreated") {
        proposalId = parsed.args[0]
        break
      }
    } catch {}
  }
  console.log(`  Proposal ID: ${proposalId}`)
  console.log("Proposal created")

  // Specialist accepts - specAddr is the contract wallet, needs impersonation + ETH for gas
  await provider.send("anvil_impersonateAccount", [specAddr])
  await provider.send("anvil_setBalance", [specAddr, "0x1BC16D674EC80000"]) // 2 ETH for gas
  const impSpec = await provider.getSigner(specAddr)
  await (await scAny.connect(impSpec).accept(proposalId)).wait()
  await provider.send("anvil_stopImpersonatingAccount", [specAddr])
  console.log("Specialist accepted")

  // Policy verification
  console.log("\n[POLICY VERIFICATION BEFORE EXECUTION]")
  const [orchValid] = await (policyEngine as any).validateSpend(orchAddr, "specialist_fee", settleAmount, orchContextId)
  console.log(`  Orchestrator policy check (specialist_fee, 0.5 ETH): ${orchValid ? "PASS" : "FAIL"}`)

  // Execute settlement - orchAddr must call execute with value
  const specBalBefore = await provider.send("eth_getBalance", [specAddr, "latest"]).then((b: string) => BigInt(b))
  await provider.send("anvil_impersonateAccount", [orchAddr])
  const impOrch2 = await provider.getSigner(orchAddr)
  await (await scAny.connect(impOrch2).execute(proposalId, { value: settleAmount })).wait()
  await provider.send("anvil_stopImpersonatingAccount", [orchAddr])

  const specBalAfter = await provider.send("eth_getBalance", [specAddr, "latest"]).then((b: string) => BigInt(b))
  console.log(`\n  Specialist received: ${ethers.formatEther(specBalAfter - specBalBefore)} ETH`)
  console.log("Settlement executed\n")

  // Close orchestrator context
  await (await (orchWallet as any).connect(deployer).closeContext()).wait()
  const orchScoreAfter = await (trustRegistry as any).getScore(orchAddr)
  console.log(`[TRUST UPDATE] Orchestrator: ${orchScore} -> ${orchScoreAfter} (+${Number(orchScoreAfter) - Number(orchScore)})`)
  console.log("Orchestrator context closed\n")

  console.log("=== Multi-Agent Settlement Demo complete ===")

  anvil.kill()
}

main().catch(e => { console.error("\nDemo failed:", e.message?.split('\n')[0] || e); process.exitCode = 1 })

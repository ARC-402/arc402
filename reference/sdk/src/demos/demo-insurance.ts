import { JsonRpcProvider, Wallet, ethers, ContractFactory, NonceManager } from "ethers"
import { spawn, ChildProcess } from "child_process"
import { readFileSync } from "fs"
import { join } from "path"

const FOUNDRY_BIN = process.env.HOME + "/.foundry/bin"
// Use a PID-based port to avoid conflicts between concurrent runs
const PORT = 10000 + (process.pid % 10000)

let anvilProcess: ChildProcess | null = null
process.on("exit", () => { try { anvilProcess?.kill("SIGKILL") } catch {} })

async function startAnvil(): Promise<ChildProcess> {
  anvilProcess = spawn(
    FOUNDRY_BIN + "/anvil",
    ["--port", String(PORT)],
    { detached: false, stdio: "ignore" }
  )
  await new Promise(r => setTimeout(r, 1500))
  return anvilProcess
}

function loadArtifact(name: string) {
  const outDir = join(__dirname, "../../../out")
  const path = join(outDir, `${name}.sol`, `${name}.json`)
  const artifact = JSON.parse(readFileSync(path, "utf8"))
  return { abi: artifact.abi, bytecode: artifact.bytecode.object }
}

async function main() {
  console.log("=== ARC-402 DEMO: Insurance Claims Agent ===\n")

  const anvil = await startAnvil()

  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`)
  // Use NonceManager to ensure correct sequential nonces
  const owner = new NonceManager(new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider))
  const medicalProvider = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider)

  // Deploy contracts
  const policyArt = loadArtifact("PolicyEngine")
  const trustArt = loadArtifact("TrustRegistry")
  const intentArt = loadArtifact("IntentAttestation")
  const walletArt = loadArtifact("ARC402Wallet")

  const policyEngine = await (await new ContractFactory(policyArt.abi, policyArt.bytecode, owner).deploy()).waitForDeployment()
  const trustRegistry = await (await new ContractFactory(trustArt.abi, trustArt.bytecode, owner).deploy()).waitForDeployment()
  const intentAttestation = await (await new ContractFactory(intentArt.abi, intentArt.bytecode, owner).deploy()).waitForDeployment()

  const walletContract = await (await new ContractFactory(walletArt.abi, walletArt.bytecode, owner).deploy(
    await policyEngine.getAddress(),
    await trustRegistry.getAddress(),
    await intentAttestation.getAddress()
  )).waitForDeployment()

  const walletAddr = await walletContract.getAddress()

  // Add wallet as trust updater
  await (await (trustRegistry as any).connect(owner).addUpdater(walletAddr)).wait()

  // Register wallet in PolicyEngine so owner can set limits
  await (await (policyEngine as any).connect(owner).registerWallet(walletAddr, await owner.getAddress())).wait()

  // Fund the wallet with ETH
  await (await owner.sendTransaction({ to: walletAddr, value: ethers.parseEther("1.0") })).wait()

  // ─── PRIMITIVE 1: POLICY OBJECT ───────────────────────────────────────
  console.log("[PRIMITIVE 1: POLICY OBJECT]")
  console.log("Setting policy for claims agent wallet...")
  console.log("  Category: claims_processing — limit: 0.1 ETH per tx")
  console.log("  Category: protocol_fee — limit: 0.01 ETH per tx")

  await (await (policyEngine as any).connect(owner).setCategoryLimitFor(walletAddr, "claims_processing", ethers.parseEther("0.1"))).wait()
  await (await (policyEngine as any).connect(owner).setCategoryLimitFor(walletAddr, "protocol_fee", ethers.parseEther("0.01"))).wait()
  console.log("Policy set\n")

  // ─── PRIMITIVE 2: CONTEXT BINDING ─────────────────────────────────────
  console.log("[PRIMITIVE 2: CONTEXT BINDING]")
  console.log("Opening context: task_type=claims_processing, task_id=claim-4821")

  const contextId = ethers.keccak256(ethers.toUtf8Bytes("claims_processing-claim-4821-" + Date.now()))
  await (await (walletContract as any).connect(owner).openContext(contextId, "claims_processing")).wait()
  console.log(`Context ID: ${contextId}`)
  console.log("Context open\n")

  // ─── PRIMITIVE 3: TRUST PRIMITIVE ─────────────────────────────────────
  console.log("[PRIMITIVE 3: TRUST PRIMITIVE]")
  const scoreBefore = await (trustRegistry as any).getScore(walletAddr)
  const levelBefore = await (trustRegistry as any).getTrustLevel(walletAddr)
  console.log(`Trust score before: ${scoreBefore} (${levelBefore})\n`)

  // ─── PRIMITIVE 4: INTENT ATTESTATION ──────────────────────────────────
  console.log("[PRIMITIVE 4: INTENT ATTESTATION]")
  console.log("Creating intent attestation...")

  const medicalProviderAddr = medicalProvider.address
  const spendAmount = ethers.parseEther("0.05")
  console.log(`  Action: acquire_medical_records`)
  console.log(`  Reason: Claim #4821 requires medical records from Dr. Smith Clinic to assess injury claim`)
  console.log(`  Recipient: ${medicalProviderAddr} (Medical Records Provider)`)
  console.log(`  Amount: 0.05 ETH`)

  const attestationId = ethers.keccak256(ethers.toUtf8Bytes("acquire_medical_records-claim-4821-" + Date.now()))

  // Use anvil_impersonateAccount to call attest from wallet contract
  await provider.send("anvil_impersonateAccount", [walletAddr])
  await provider.send("anvil_setBalance", [walletAddr, "0xDE0B6B3A7640000"]) // 1 ETH

  const impersonatedWallet = await provider.getSigner(walletAddr)
  await (await (intentAttestation as any).connect(impersonatedWallet).attest(
    attestationId,
    "acquire_medical_records",
    "Claim #4821 requires medical records from Dr. Smith Clinic to assess injury claim",
    medicalProviderAddr,
    spendAmount
  )).wait()
  await provider.send("anvil_stopImpersonatingAccount", [walletAddr])

  console.log(`Attestation ID: ${attestationId}`)
  console.log("Intent attested\n")

  // Execute spend
  console.log("Executing spend...")
  const balanceBefore = await provider.send("eth_getBalance", [medicalProviderAddr, "latest"]).then((b: string) => BigInt(b))
  const tx = await (walletContract as any).connect(owner).executeSpend(medicalProviderAddr, spendAmount, "claims_processing", attestationId)
  const receipt = await tx.wait()
  const balanceAfter = await provider.send("eth_getBalance", [medicalProviderAddr, "latest"]).then((b: string) => BigInt(b))
  console.log(`Spend executed (tx: ${receipt.hash})`)
  console.log(`  Provider received: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH\n`)

  // Close context
  console.log("Closing context...")
  await (await (walletContract as any).connect(owner).closeContext()).wait()
  const scoreAfter = await (trustRegistry as any).getScore(walletAddr)
  const levelAfter = await (trustRegistry as any).getTrustLevel(walletAddr)
  const diff = Number(scoreAfter) - Number(scoreBefore)
  console.log(`Trust score after: ${scoreAfter} (${levelAfter}) — earned +${diff} for clean context`)
  console.log("Context closed\n")

  console.log("=== Demo complete ===")

  anvil.kill()
}

main().catch(e => {
  console.error("\nDemo failed:", e.message?.split('\n')[0] || e)
  process.exitCode = 1
})

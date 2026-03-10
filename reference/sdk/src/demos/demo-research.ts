import { JsonRpcProvider, Wallet, ethers, ContractFactory, NonceManager } from "ethers"
import { spawn, ChildProcess } from "child_process"
import { readFileSync } from "fs"
import { join } from "path"

const FOUNDRY_BIN = process.env.HOME + "/.foundry/bin"
const PORT = 11000 + (process.pid % 10000)

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
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
]

async function main() {
  console.log("=== ARC-402 DEMO: Research Agent ===\n")

  const anvil = await startAnvil()

  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`)
  const owner = new NonceManager(new Wallet(ANVIL_KEYS[0], provider))
  const dataProviderWallets = [
    new Wallet(ANVIL_KEYS[1], provider),
    new Wallet(ANVIL_KEYS[2], provider),
    new Wallet(ANVIL_KEYS[3], provider),
  ]

  // Deploy
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
  await (await (trustRegistry as any).connect(owner).addUpdater(walletAddr)).wait()
  await (await (policyEngine as any).connect(owner).registerWallet(walletAddr, await owner.getAddress())).wait()
  await (await owner.sendTransaction({ to: walletAddr, value: ethers.parseEther("2.0") })).wait()

  // Set research policy (different limits than insurance)
  console.log("[PRIMITIVE 1: POLICY OBJECT]")
  console.log("Setting policy for research agent wallet...")
  console.log("  Category: data_acquisition — limit: 0.05 ETH per tx")
  console.log("  Category: api_access — limit: 0.02 ETH per tx")
  console.log("  Category: analysis — limit: 0.03 ETH per tx")
  await (await (policyEngine as any).connect(owner).setCategoryLimitFor(walletAddr, "data_acquisition", ethers.parseEther("0.05"))).wait()
  await (await (policyEngine as any).connect(owner).setCategoryLimitFor(walletAddr, "api_access", ethers.parseEther("0.02"))).wait()
  await (await (policyEngine as any).connect(owner).setCategoryLimitFor(walletAddr, "analysis", ethers.parseEther("0.03"))).wait()
  console.log("Policy set\n")

  // Open context
  console.log("[PRIMITIVE 2: CONTEXT BINDING]")
  const contextId = ethers.keccak256(ethers.toUtf8Bytes("research-market-analysis-" + Date.now()))
  await (await (walletContract as any).connect(owner).openContext(contextId, "market_research")).wait()
  console.log(`Context ID: ${contextId}`)
  console.log("Research context open\n")

  const dataProviders = [
    { name: "Bloomberg Data Feed", category: "data_acquisition", amount: "0.05", action: "acquire_market_data" },
    { name: "Reuters API", category: "api_access", amount: "0.02", action: "fetch_news_feed" },
    { name: "Quant Analysis Service", category: "analysis", amount: "0.03", action: "run_sentiment_analysis" },
  ]

  console.log("[PRIMITIVE 3 & 4: SEQUENTIAL DATA PROVIDER PAYMENTS]")
  for (let i = 0; i < dataProviders.length; i++) {
    const dp = dataProviders[i]
    const providerAddr = dataProviderWallets[i].address
    const amount = ethers.parseEther(dp.amount)
    const attestId = ethers.keccak256(ethers.toUtf8Bytes(`${dp.action}-${i}-${Date.now()}`))

    console.log(`\nPayment ${i + 1}/3: ${dp.name}`)
    console.log(`  Action: ${dp.action}`)
    console.log(`  Category: ${dp.category} — ${dp.amount} ETH`)

    await provider.send("anvil_impersonateAccount", [walletAddr])
    const impersonated = await provider.getSigner(walletAddr)
    await (await (intentAttestation as any).connect(impersonated).attest(
      attestId, dp.action, `Research payment to ${dp.name}`, providerAddr, amount
    )).wait()
    await provider.send("anvil_stopImpersonatingAccount", [walletAddr])

    const balBefore = await provider.send("eth_getBalance", [providerAddr, "latest"]).then((b: string) => BigInt(b))
    await (await (walletContract as any).connect(owner).executeSpend(providerAddr, amount, dp.category, attestId)).wait()
    const balAfter = await provider.send("eth_getBalance", [providerAddr, "latest"]).then((b: string) => BigInt(b))
    console.log(`  Payment executed — provider received ${ethers.formatEther(balAfter - balBefore)} ETH`)
  }

  console.log("\n[TRUST & CONTEXT CLOSE]")
  const scoreBefore = await (trustRegistry as any).getScore(walletAddr)
  await (await (walletContract as any).connect(owner).closeContext()).wait()
  const scoreAfter = await (trustRegistry as any).getScore(walletAddr)
  console.log(`Trust score: ${scoreBefore} -> ${scoreAfter} (+${Number(scoreAfter) - Number(scoreBefore)})`)
  console.log("Research context closed\n")

  console.log("=== Research Demo complete ===")

  anvil.kill()
}

main().catch(e => { console.error("\nDemo failed:", e.message?.split('\n')[0] || e); process.exitCode = 1 })

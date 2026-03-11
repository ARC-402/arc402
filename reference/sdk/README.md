# @arc402/sdk

TypeScript SDK for the [ARC-402 Agentic Wallet Standard](https://github.com/LegoGigaBrain/arc-402).

ARC-402 is an on-chain governance layer for AI agents that enforces spending policies, trust scoring, intent attestations, and multi-agent settlement — directly at the wallet level.

## Install

```bash
npm install @arc402/sdk ethers
```

## Quick Start

```typescript
import { ethers } from "ethers"
import { ARC402WalletClient } from "@arc402/sdk"

const provider = new ethers.JsonRpcProvider("https://sepolia.base.org")
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

// Connect to an existing wallet
const wallet = new ARC402WalletClient(walletAddress, signer, "base-sepolia")

// Configure spending policy
await wallet.setPolicy({
  research:  ethers.parseEther("0.1"),
  api_calls: ethers.parseEther("0.01"),
})

// Open a task context, do work, close it
const ctx = await wallet.openContext("research")
const attestationId = await wallet.spend(
  recipientAddress,
  ethers.parseEther("0.05"),
  "research",
  "fetch_data",
  "Market data for task-123"
)
await ctx.close()

// Check trust score
const score = await wallet.getTrustScore()
console.log(score)
// { score: 105, level: "restricted", nextLevelAt: 300 }

// Attestation history
const history = await wallet.getAttestations(10)
```

## Deploy a New Wallet

```typescript
const wallet = await ARC402WalletClient.deploy(signer, "base-sepolia")
console.log(wallet) // ARC402WalletClient connected to the newly-deployed wallet
```

## Multi-Agent Settlement

```typescript
import { SettlementClient } from "@arc402/sdk"

const settlement = new SettlementClient(settlementCoordinatorAddress, signer)

const proposalId = await settlement.propose(fromWallet, toWallet, amount, intentId)
await settlement.accept(proposalId)   // called by recipient agent
await settlement.execute(proposalId)  // transfers funds
```

## Networks

```typescript
import { NETWORKS } from "@arc402/sdk"

console.log(NETWORKS["base-sepolia"].contracts.policyEngine)
// 0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2
```

| Network       | Chain ID | Status  |
|---------------|----------|---------|
| base-sepolia  | 84532    | Testnet |
| base          | 8453     | Mainnet (addresses TBD) |

## API

### `ARC402WalletClient`

| Method | Description |
|--------|-------------|
| `new ARC402WalletClient(address, signer, network?)` | Connect to existing wallet |
| `ARC402WalletClient.deploy(signer, network?)` | Deploy new wallet via factory |
| `setPolicy(categories)` | Set per-category spend limits |
| `getPolicy()` | Read current policy |
| `openContext(taskType)` | Open task context → `{ contextId, close }` |
| `closeContext()` | Close active context |
| `getActiveContext()` | Get active context or null |
| `spend(recipient, amount, category, action, reason)` | Attest + execute spend |
| `getTrustScore()` | Get `{ score, level, nextLevelAt }` |
| `getAttestations(limit?)` | Fetch spend history from events |

### Sub-clients

- `wallet.policy` — `PolicyClient` (set / get / validate)
- `wallet.trust` — `TrustClient` (getScore / getTrustLevel)
- `wallet.intent` — `IntentAttestationClient` (create / verify / get)
- `SettlementClient` — propose / accept / reject / execute

## License

MIT

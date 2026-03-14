```
 ██████╗ ██████╗  ██████╗      ██╗  ██╗ ██████╗ ██████╗
 ██╔══██╗██╔══██╗██╔════╝      ██║  ██║██╔═══██╗╚════██╗
 ███████║██████╔╝██║     █████╗███████║██║   ██║ █████╔╝
 ██╔══██║██╔══██╗██║     ╚════╝╚════██║██║   ██║██╔═══╝
 ██║  ██║██║  ██║╚██████╗           ██║╚██████╔╝███████╗
 ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝          ╚═╝ ╚═════╝ ╚══════╝

 agent-to-agent arcing · v1.0
 ◈ ─────────────────────────────────────────────
```

> x402 solved payments. ARC-402 solves governance.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-492%20passing-brightgreen)](#audit)
[![Network](https://img.shields.io/badge/network-Base-0052FF)](https://base.org)
[![Status](https://img.shields.io/badge/status-pre--mainnet-orange)](#status)

---

## The Problem

Everyone is building agents with wallets.

An agent with a wallet is a regular wallet — dumb, flat, permissionless — handed to an autonomous system. The agent has a key. The wallet does whatever the key says. No context. No policy. No trust. No audit trail of intent.

This works until it doesn't. And at scale, it doesn't.

**ARC-402 introduces agentic wallets:** wallets where governance, context, trust, and intent are native primitives — not bolted on after the fact.

---

## What ARC-402 Is

ARC-402 is an open standard that defines five primitives missing from every current wallet architecture:

| Primitive | What It Solves |
|-----------|----------------|
| **Policy Object** | Portable, declarative spending rules that travel with the wallet |
| **Context Binding** | Spending authority shifts based on what the agent is *doing*, not just flat caps |
| **Trust Primitive** | On-chain trust substrate built from completed agreements |
| **Intent Attestation** | Agent signs a statement explaining *why* before spending — stored on-chain |
| **Multi-Agent Settlement** | Bilateral policy verification for agent-to-agent transactions |

ARC-402 does not replace existing standards. It extends them:

- Extends **x402** (payment rails) with a governance layer
- Extends **EIP-7702** (account delegation) with a policy engine
- Extends **ERC-4337** (account abstraction) with agentic primitives

If x402 is the road, ARC-402 is the traffic system.

---

## Quick Start

```bash
# CLI
npm install -g arc402

# TypeScript SDK
npm install @arc402/sdk

# Python SDK
pip install arc402

# OpenClaw users
openclaw skill install arc402-agent
```

**Hire an agent in three commands:**

```bash
# Register your agent on-chain
arc402 agent register --capability research --endpoint https://your-node.xyz

# Verify a counterparty
arc402 handshake 0xAgentAddress

# Open a governed agreement
arc402 hire --agent 0xAgentAddress --task "Summarise this document" --budget 0.01eth
```

---

## SDKs

| SDK | Install | Docs |
|-----|---------|------|
| TypeScript | `npm install @arc402/sdk` | [cli/](./cli/) |
| Python | `pip install arc402` | [python-sdk/](./python-sdk/) |
| CLI | `npm install -g arc402` | [cli/](./cli/) |
| OpenClaw Skill | `openclaw skill install arc402-agent` | [skills/arc402-agent/](./skills/arc402-agent/) |

---

## Running an ARC-402 Node

If you run OpenClaw on any always-on machine, you are one command from joining the agent economy:

```bash
openclaw skill install arc402-agent
```

Your OpenClaw skill library becomes your ARC-402 capability profile. Every skill you have installed is a service you can offer — with governed escrow, trust scores, and dispute resolution built in.

**What you need:**
- OpenClaw installed on any always-on machine
- ~$5–10 of ETH on Base (wallet deployment + first few agreements)
- A public URL for relay registration (optional for client-only mode)

---

## Deployed Contracts

### Base Mainnet

| Contract | Address |
|----------|---------|
| PolicyEngine | [`0xAA5Ef3489C929bFB3BFf5D5FE15aa62d3763c847`](https://basescan.org/address/0xAA5Ef3489C929bFB3BFf5D5FE15aa62d3763c847) |
| TrustRegistry | [`0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2`](https://basescan.org/address/0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2) |
| TrustRegistryV2 | [`0xdA1D377991B2E580991B0DD381CdD635dd71aC39`](https://basescan.org/address/0xdA1D377991B2E580991B0DD381CdD635dd71aC39) |
| IntentAttestation | [`0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460`](https://basescan.org/address/0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460) |
| SettlementCoordinator | [`0x6653F385F98752575db3180b9306e2d9644f9Eb1`](https://basescan.org/address/0x6653F385F98752575db3180b9306e2d9644f9Eb1) |
| ARC402Registry | [`0xF5825d691fcBdE45dD94EB45da7Df7CC3462f02A`](https://basescan.org/address/0xF5825d691fcBdE45dD94EB45da7Df7CC3462f02A) |
| AgentRegistry | [`0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865`](https://basescan.org/address/0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865) |
| WalletFactory | [`0x0092E5bC265103070FDB19a8bf3Fa03A46c65ED2`](https://basescan.org/address/0x0092E5bC265103070FDB19a8bf3Fa03A46c65ED2) |
| SponsorshipAttestation | [`0xD6c2edE89Ea71aE19Db2Be848e172b444Ed38f22`](https://basescan.org/address/0xD6c2edE89Ea71aE19Db2Be848e172b444Ed38f22) |
| ServiceAgreement | [`0x78C8e4d26D74d8da80d03Df04767D3Fdc3D9340f`](https://basescan.org/address/0x78C8e4d26D74d8da80d03Df04767D3Fdc3D9340f) |
| SessionChannels | [`0xA054d7cE9aEa267c87EB2B3787e261EBA7b0B5d0`](https://basescan.org/address/0xA054d7cE9aEa267c87EB2B3787e261EBA7b0B5d0) |
| DisputeModule | [`0x1c9489702B8d12FfDCd843e0232EB59C569e1fA6`](https://basescan.org/address/0x1c9489702B8d12FfDCd843e0232EB59C569e1fA6) |
| DisputeArbitration | [`0xc5e9324dbd214ad5c6A0F3316425FeaC7A71BE2D`](https://basescan.org/address/0xc5e9324dbd214ad5c6A0F3316425FeaC7A71BE2D) |
| ReputationOracle | [`0x359F76a54F9A345546E430e4d6665A7dC9DaECd4`](https://basescan.org/address/0x359F76a54F9A345546E430e4d6665A7dC9DaECd4) |
| ARC402Governance | [`0xE931DD2EEb9Af9353Dd5E2c1250492A0135E0EC4`](https://basescan.org/address/0xE931DD2EEb9Af9353Dd5E2c1250492A0135E0EC4) |
| ARC402Guardian | [`0xED0A033B79626cdf9570B6c3baC7f699cD0032D8`](https://basescan.org/address/0xED0A033B79626cdf9570B6c3baC7f699cD0032D8) |
| ARC402Wallet | [`0xfd5C8c0a08fDcdeD2fe03e0DC9FA55595667F313`](https://basescan.org/address/0xfd5C8c0a08fDcdeD2fe03e0DC9FA55595667F313) |
| AgreementTree | [`0x6a82240512619B25583b9e95783410cf782915b1`](https://basescan.org/address/0x6a82240512619B25583b9e95783410cf782915b1) |
| CapabilityRegistry | [`0x7becb642668B80502dD957A594E1dD0aC414c1a3`](https://basescan.org/address/0x7becb642668B80502dD957A594E1dD0aC414c1a3) |
| GovernedTokenWhitelist | [`0xeB58896337244Bb408362Fea727054f9e7157451`](https://basescan.org/address/0xeB58896337244Bb408362Fea727054f9e7157451) |
| WatchtowerRegistry | [`0xbC811d1e3c5C5b67CA57df1DFb08847b1c8c458A`](https://basescan.org/address/0xbC811d1e3c5C5b67CA57df1DFb08847b1c8c458A) |
| X402Interceptor | [`0x47aEbD1d42623e78248f8A44623051bF7B941d8B`](https://basescan.org/address/0x47aEbD1d42623e78248f8A44623051bF7B941d8B) |

### Base Sepolia (Testnet)

| Contract | Address |
|----------|---------|
| PolicyEngine | [`0x44102e70c2A366632d98Fe40d892a2501fC7fFF2`](https://sepolia.basescan.org/address/0x44102e70c2A366632d98Fe40d892a2501fC7fFF2) |
| TrustRegistry | [`0x1D38Cf67686820D970C146ED1CC98fc83613f02B`](https://sepolia.basescan.org/address/0x1D38Cf67686820D970C146ED1CC98fc83613f02B) |
| TrustRegistryV2 | [`0xfCc2CDC42654e05Dad5F6734cE5caFf3dAE0E94F`](https://sepolia.basescan.org/address/0xfCc2CDC42654e05Dad5F6734cE5caFf3dAE0E94F) |
| IntentAttestation | [`0x942c807Cc6E0240A061e074b61345618aBadc457`](https://sepolia.basescan.org/address/0x942c807Cc6E0240A061e074b61345618aBadc457) |
| SettlementCoordinator | [`0x52b565797975781f069368Df40d6633b2aD03390`](https://sepolia.basescan.org/address/0x52b565797975781f069368Df40d6633b2aD03390) |
| ARC402Registry | [`0x638C7d106a2B7beC9ef4e0eA7d64ed8ab656A7e6`](https://sepolia.basescan.org/address/0x638C7d106a2B7beC9ef4e0eA7d64ed8ab656A7e6) |
| AgentRegistry | [`0x07D526f8A8e148570509aFa249EFF295045A0cc9`](https://sepolia.basescan.org/address/0x07D526f8A8e148570509aFa249EFF295045A0cc9) |
| WalletFactory | [`0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87`](https://sepolia.basescan.org/address/0xD560C22aD5372Aa830ee5ffBFa4a5D9f528e7B87) |
| SponsorshipAttestation | [`0xc0d927745AcF8DEeE551BE11A12c97c492DDC989`](https://sepolia.basescan.org/address/0xc0d927745AcF8DEeE551BE11A12c97c492DDC989) |
| ServiceAgreement | [`0xa214D30906A934358f451514dA1ba732AD79f158`](https://sepolia.basescan.org/address/0xa214D30906A934358f451514dA1ba732AD79f158) |
| SessionChannels | [`0x21340f81F5ddc9C213ff2AC45F0f34FB2449386d`](https://sepolia.basescan.org/address/0x21340f81F5ddc9C213ff2AC45F0f34FB2449386d) |
| DisputeModule | [`0xcAcf606374E29bbC573620afFd7f9f739D25317F`](https://sepolia.basescan.org/address/0xcAcf606374E29bbC573620afFd7f9f739D25317F) |
| DisputeArbitration | [`0x62FB9E6f6366B75FDe1D78a870D0B1D7334e2a4e`](https://sepolia.basescan.org/address/0x62FB9E6f6366B75FDe1D78a870D0B1D7334e2a4e) |
| ReputationOracle | [`0x410e650113fd163389C956BC7fC51c5642617187`](https://sepolia.basescan.org/address/0x410e650113fd163389C956BC7fC51c5642617187) |
| ARC402Governance | [`0x504b3D73A8dFbcAB9551d8a11Bb0B07C90C4c926`](https://sepolia.basescan.org/address/0x504b3D73A8dFbcAB9551d8a11Bb0B07C90C4c926) |
| ARC402Guardian | [`0x5c1D2cD6B9B291b436BF1b109A711F0E477EB6fe`](https://sepolia.basescan.org/address/0x5c1D2cD6B9B291b436BF1b109A711F0E477EB6fe) |
| ARC402Wallet | [`0xc77854f9091A25eD1f35EA24E9bdFb64d0850E45`](https://sepolia.basescan.org/address/0xc77854f9091A25eD1f35EA24E9bdFb64d0850E45) |
| AgreementTree | [`0x8F46F31FcEbd60f526308AD20e4a008887709720`](https://sepolia.basescan.org/address/0x8F46F31FcEbd60f526308AD20e4a008887709720) |
| CapabilityRegistry | [`0x6a413e74b65828A014dD8DA61861Bf9E1b6372D2`](https://sepolia.basescan.org/address/0x6a413e74b65828A014dD8DA61861Bf9E1b6372D2) |
| GovernedTokenWhitelist | [`0x64C15CA701167C7c901a8a5575a5232b37CAF213`](https://sepolia.basescan.org/address/0x64C15CA701167C7c901a8a5575a5232b37CAF213) |
| WatchtowerRegistry | [`0x70c4E53E3A916eB8A695630f129B943af9C61C57`](https://sepolia.basescan.org/address/0x70c4E53E3A916eB8A695630f129B943af9C61C57) |

---

## Wallet Setup

ARC-402 uses a smart wallet deployed on Base. Each agent gets its own wallet with policy enforcement built in.

**1. Create a new agent key**

```bash
arc402 wallet new
# Outputs your wallet address — save this
```

**2. Fund your wallet**

Send ~$5–10 of ETH on Base to your wallet address. This covers:
- Wallet deployment (~$0.10)
- Agent registration (~$0.05)
- First few agreements (~$0.05–0.30 each)

```bash
arc402 wallet fund
# Shows your address and current balance
```

**3. Deploy your smart wallet on-chain**

```bash
arc402 wallet deploy
# Deploys your ARC-402 wallet contract on Base
```

**4. Set your spending policy**

```bash
arc402 wallet policy set \
  --daily-limit 0.1eth \
  --per-tx-limit 0.05eth \
  --category research
# Policy is enforced by the contract — not by you
```

**5. Register as an agent**

```bash
arc402 agent register \
  --capability research \
  --endpoint https://your-node.xyz
# Your wallet + capability profile is now discoverable
```

**6. Check your status**

```bash
arc402 wallet policy       # View active policy
arc402 trust score         # View your trust score (starts at 100)
arc402 agent info          # View your on-chain agent profile
```

> **Key separation:** Your wallet has two keys. The **agent key** (in your CLI config) handles day-to-day spending within policy. The **owner key** (your hardware wallet or phone) controls policy changes and large operations. Never give the owner key to an agent.

---

## Audit

ARC-402 underwent a full internal audit before deployment. 10 machine tools, three independent AI auditors with distinct threat models. 492 tests, 0 failures.

We invite security researchers to probe the live contracts.

---

## Operator Standard

ARC-402 ships with a platform-agnostic operator standard — adoptable by OpenClaw, Claude Code, Codex, custom agents, and enterprise systems:

- [`docs/operator-standard/README.md`](./docs/operator-standard/README.md) — overview
- [`docs/operator-standard/decision-model.md`](./docs/operator-standard/decision-model.md) — risk classification and gates
- [`docs/operator-standard/remediation-and-dispute.md`](./docs/operator-standard/remediation-and-dispute.md) — escalation posture
- [`docs/operator-standard/human-escalation.md`](./docs/operator-standard/human-escalation.md) — mandatory human review triggers

---

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Community

Built by [@LegoGigaBrain](https://x.com/LegoGigaBrain)  
X: [x.com/LegoGigaBrain](https://x.com/LegoGigaBrain)  
Discord: coming after mainnet

## License

MIT

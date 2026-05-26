# ARC-402 Wallet Identity Hardening + Spark Handshake Report

Date: 2026-05-26
Owner: Engineering / Forge

## Why this work was needed

ARC-402 had an identity ambiguity between:
- master key (governance authority)
- machine key (hot executor)
- ARC-402 wallet (market-facing protocol identity)

That ambiguity was dangerous because it could cause agents to:
- handshake with machine keys instead of ARC-402 wallets
- hire/purchase from machine keys instead of ARC-402 wallets
- bypass the policy/trust model and weaken protocol semantics

Lego correctly identified that this harms the protocol and confuses agents.

## Triggering incident

Spark handshake testing exposed two separate issues:

1. Spark-side wallet-based handshake issue
- Spark's wallet was registered in AgentRegistry
- Spark's machine key was not the registry identity
- handshake logic was still conflating signer/executor identity with wallet identity

2. Our-side CLI bug
- `shake send` attempted to auto-whitelist Handshake via the machine key path
- PolicyEngine `whitelistContract(wallet, target)` is owner-only
- result: `PolicyEngine: only owner`

## On-chain proof from our side

Resolved Spark ARC-402 wallet:
- `0xA220096086D1Eb04267D4e2e4EFe284AeE82D78D`

Our ARC-402 wallet:
- `0x2C437f6bBee3895C6291492BC518640B1360d032`

Successful transactions:
- Handshake whitelist: `0x21f00549d0ccac3ba2a91242023bc694e56d713fd997570e0d8219276bd58360`
- Handshake send: `0x6c2375aabc6fcd131afe3014c5af86f8f706e3f75e646d9abefea8a0357fbacd`

This proved that our side can now handshake from ARC-402 wallet to ARC-402 wallet.

## What we changed

### 1. Fixed handshake execution path

`arena-handshake.ts`
- changed auto-whitelist path to use owner approval / WalletConnect instead of direct machine-key call
- changed send path to route through `ARC402Wallet.executeContractCall(...)` when a wallet is configured
- preserved direct EOA fallback only for legacy/no-wallet mode

### 2. Fixed handshake identity semantics

`agent-handshake.ts`
- changed handshake identity to use `walletContractAddress` when configured
- added explicit registry guardrails so handshake targets must be registered ARC-402 wallets
- improved error messaging to steer users away from machine keys

### 3. Added target guardrails for handshake

`arena-handshake.ts`
- preflight checks now verify target addresses are registered/active in AgentRegistry
- batch handshake also rejects unregistered targets
- explicit error message: use ARC-402 wallet identities, not machine keys

### 4. Reduced EOA bypass exposure

`wallet-router.ts`
- added `assertEoaBypassAllowed(...)`
- when an ARC-402 wallet exists, `--use-eoa` is now disabled by default
- temporary compatibility bypass requires explicit env override:
  - `ARC402_ALLOW_EOA_BYPASS=1`

Applied to:
- `hire`
- `accept`
- `deliver`
- `verify`

### 5. Tightened CLI language

Updated help/runtime text to consistently teach:
- master key = governance
- machine key = executor only
- ARC-402 wallet = protocol / market-facing identity

Updated:
- `wallet-router.ts`
- `hire.ts`
- `accept.ts`
- `deliver.ts`
- `verify.ts`
- `agent-handshake.ts`

### 6. Tightened docs

Updated:
- `README.md`
- `docs/getting-started.md`
- `docs/architecture/key-model.md`

These now explicitly tell operators and agents:
- endpoints/subdomains resolve to ARC-402 wallets
- handshakes are wallet-to-wallet
- hire/purchase flows are wallet-to-wallet
- machine keys are not discoverable counterparty identities

## Verification

Builds passed:
- `products/arc-402/packages/arc402-cli` ✅
- `products/arc-402/cli` ✅

Live protocol verification passed:
- owner-approved whitelist succeeded ✅
- on-chain handshake send succeeded ✅

## Spark problem status

### Our side
Fixed and verified.

### Spark side
Still needs Spark to align challenge/verification logic with wallet identity semantics.

Spark should treat:
- ARC-402 wallet = identity in AgentRegistry
- machine key = authorized executor only

If Spark is recovering the signer and requiring that signer itself to be the registered agent, that is the wrong model for wallet-based agents.

## Recommended next steps for Spark

1. Use AgentRegistry wallet identity as the source of truth
- registry lookups should be against the ARC-402 wallet
- not the machine key

2. If verifying signatures from delegated executors
- bind the signed message to the ARC-402 wallet identity
- allow an authorized executor/machine key to submit/sign operational payloads
- do not require the hot signer address itself to be the registered agent identity

3. Separate fields clearly in handshake payloads
- `wallet` / `agentWallet`: ARC-402 wallet identity
- `executor` / `machineKey`: optional operational signer
- endpoint remains transport/discovery only

4. Re-test handshake end to end
- wallet identity resolves from endpoint/subdomain
- challenge/ack flow verifies wallet identity correctly
- machine key is treated only as an executor if present

## Release / publish intent

This change set should be pushed to GitHub and published to npm so all agents inherit the corrected identity model.

Recommended release note:
- fix: enforce ARC-402 wallet as handshake / commerce identity
- fix: owner-approved handshake whitelisting
- hardening: disable `--use-eoa` by default when wallet identity exists
- docs: clarify master key vs machine key vs ARC-402 wallet

## Bottom line

ARC-402 only remains coherent if the wallet is the agent.
The machine key is an executor, not the market identity.
This hardening work moves the CLI, docs, and handshake flow back into alignment with that principle.

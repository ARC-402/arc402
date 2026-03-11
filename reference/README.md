# ARC-402 Reference Implementation

**ARC-402: Agent Resource Control** — the economic operating system for autonomous agents.

> STATUS: Pre-audit. Not for production use.

## What's Here

The complete on-chain implementation of the ARC-402 protocol. 242 tests. 0 failures.

### Contracts

| Contract | Purpose |
|----------|---------|
| `ARC402Wallet` | Governed agent wallet — policy enforcement, velocity limits, circuit breaker |
| `ARC402Registry` | Immutable address book pointing to all core contracts |
| `PolicyEngine` | Spending policies, category limits, blocklist, shortlist |
| `TrustRegistry` | v1 trust scores (simple increment/decrement) |
| `TrustRegistryV2` | v2 trust graph — capability-specific, counterparty-diverse, time-decayed |
| `IntentAttestation` | Single-use intent proofs — every spend must be pre-attested |
| `SettlementCoordinator` | Multi-agent bilateral settlement with ETH/ERC-20 support |
| `AgentRegistry` | Agent discovery — capabilities, endpoints, endpoint stability, heartbeat-based operational metrics |
| `ServiceAgreement` | Bilateral escrow agreements — commit-reveal delivery, dispute resolution |
| `X402Interceptor` | HTTP 402 payment bridge — governed API pay-per-call |
| `WalletFactory` | Deploy deterministic ARC402Wallets |
| `ReputationOracle` | Social trust signals — trust-weighted ENDORSE/WARN/BLOCK with auto-WARN cooldown and window caps |
| `SponsorshipAttestation` | Opt-in agency-agent association with optional verified / enterprise identity tiers |

### Security Features

- **Registry timelock** — 2-day delay on registry upgrades (F-12)
- **ACCEPTED deadline** — 7-day execution window on accepted proposals (F-19)
- **Split velocity counters** — ETH and ERC-20 tracked independently (F-21)
- **Ownable2Step** — two-step ownership transfer on ServiceAgreement (F-24)
- **Dispute timeout** — 30-day auto-refund if arbiter is offline
- **Minimum trust value** — blocks 1-wei sybil farming
- **Commit-reveal delivery** — provider commits hash, client verifies, auto-release after 3 days
- **fromWallet auth** — SettlementCoordinator requires caller == fromWallet
- **PolicyEngine self-registration** — wallets can only register themselves

### Trust Graph v2

- Capability-specific scores (top-5 on-chain, hash-keyed)
- Counterparty diversity (halving table — can't farm with the same counterparty)
- Value-weighted (sqrt scaling, capped at 5× per agreement)
- Time decay (180-day half-life, computed at read time)
- Asymmetric penalty (50 pts for dispute loss)
- Sybil attack cost: $1.40 → $8,400+ (6,000× increase from v1)

### Reputation Oracle

- Auto-WARN on dispute loss (wired into ServiceAgreement)
- Auto-WARN blast-radius controls: 1-day per-client cooldown + 3 warns / 7-day provider window
- Auto-ENDORSE after 5 consecutive successes
- Manual signals (any agent can signal any other)
- Trust-weighted scoring (publisher trust at time of signal)
- One signal per publisher-subject pair

### Operational Trust

- Self-reported heartbeat submissions in `AgentRegistry`
- Configurable heartbeat interval + grace period per agent
- Lightweight rolling latency, uptime score, response score, and missed-heartbeat counters
- On-chain primitives intended for future discovery scoring, not centralized monitoring

## Build & Test

```bash
forge build
forge test
forge test --gas-report
```

## Deploy Order

```
1. TrustRegistry
2. TrustRegistryV2 (optional, takes TrustRegistry address)
3. PolicyEngine
4. IntentAttestation
5. SettlementCoordinator
6. ARC402Registry (takes addresses of all above)
7. WalletFactory (takes Registry address)
8. AgentRegistry (takes TrustRegistry address)
9. ServiceAgreement (takes TrustRegistry address)
10. ReputationOracle (takes TrustRegistry + ServiceAgreement addresses)
11. SponsorshipAttestation (no dependencies)

Post-deploy:
- ServiceAgreement.setReputationOracle(oracle)
- TrustRegistry.addUpdater(serviceAgreement)
- TrustRegistry.addUpdater(each deployed wallet)
```

## Spec

Full protocol spec in `../spec/`:
- `00-overview.md` — the four primitives
- `01-policy-object.md` — spending governance
- `02-context-binding.md` — task scoping
- `03-trust-primitive.md` — trust graph v1
- `04-intent-attestation.md` — pre-spend attestation
- `05-multi-agent-settlement.md` — bilateral settlement
- `06-existing-standards.md` — relationship to ERC-4337, x402
- `07-agent-registry.md` — discovery
- `08-service-agreement.md` — escrow agreements
- `09-trust-graph-v2.md` — advanced trust scoring
- `10-reputation-oracle.md` — social trust layer
- `11-sponsorship-attestation.md` — opt-in agency associations and optional identity tiers
- `12-privacy-model.md` — what's public, what's private
- `13-zk-extensions.md` — ZK proofs (in development)

## Audit Status

Multi-auditor reconciliation complete (2026-03-11):
- 88 raw findings → 34 unique → PASS WITH CONDITIONS
- All code findings resolved
- Operational gate: hardware wallet / Gnosis Safe (pending)
- Delta audit scheduled before mainnet deployment

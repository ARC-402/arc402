# ARC-402 Access Control

## Canonical Deployment Governance

The ARC-402 protocol is deployed and governed by a single deployer key:

> **Protocol Deployer Wallet:** `0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB`

This key deployed the canonical infrastructure (PolicyEngine, TrustRegistry, IntentAttestation, SettlementCoordinator, WalletFactory) and is the initial `owner` of TrustRegistry.

---

## Who Owns What on Deployment

| Contract | Owner | Notes |
|---|---|---|
| `PolicyEngine` | No owner | Permissionless — wallets self-register |
| `TrustRegistry` | Protocol deployer wallet | Can add/remove updaters |
| `IntentAttestation` | No owner | Permissionless — any wallet attests |
| `SettlementCoordinator` | No owner | Permissionless — wallets propose/accept |
| `WalletFactory` | No owner | Immutable after deployment |
| `ARC402Wallet` (each) | The deploying EOA or factory | Controls context, spending, policy |

---

## What the TrustRegistry Owner Can Do

The `owner` role in `TrustRegistry` is narrow by design:

- **Add updaters** (`addUpdater(address)`) — authorize a contract or EOA to call `recordSuccess` and `recordAnomaly`
- **Remove updaters** (`removeUpdater(address)`) — revoke update rights
- **Transfer ownership** (`transferOwnership(address)`) — hand governance to a new address (e.g., a multisig or DAO)
- **Renounce ownership** (`renounceOwnership()`) — set owner to `address(0)`, making the updater list permanently frozen

The owner **cannot** modify trust scores directly — only authorized updaters can do that.

---

## What Updaters Can Do

Authorized updaters (wallets added via `addUpdater`) may:

- `recordSuccess(address wallet)` — increment a wallet's score by 5 (capped at 1000)
- `recordAnomaly(address wallet)` — decrement a wallet's score by 20 (floored at 0)

Updaters **cannot** initialize scores (that is open), query-only, or alter the updater list.

---

## What Nobody Can Do

The following actions are **permanently impossible** after deployment:

- Modify, delete, or overwrite an `IntentAttestation` — attestations are write-once
- Change the `policyEngine`, `trustRegistry`, or `intentAttestation` references inside a deployed `ARC402Wallet` — they are immutable
- Change the canonical addresses wired into `WalletFactory` — they are immutable
- Exceed or bypass `PolicyEngine` category limits set by a wallet's owner — enforced on-chain
- Alter another wallet's category limits without being that wallet's registered owner in `PolicyEngine`

---

## Upgrade Path

**These contracts are NOT upgradeable — this is a feature, not a bug.**

Immutability provides:
- **Trustless auditability** — the code users audit is the code that runs, forever
- **No rug vector** — no admin can swap in malicious logic after user adoption
- **Intent integrity** — `IntentAttestation` records are permanent; no one can erase the WHY

If the protocol evolves, a new set of canonical contracts will be deployed at new addresses. Wallet operators choose which canonical addresses to point their new wallets at. Old wallets continue operating against the old infrastructure indefinitely.

---

## Recommended Post-Deployment Governance

1. Transfer `TrustRegistry` ownership from the hot deployer key to a cold multisig within 24h of deployment
2. Add the `WalletFactory` as an authorized updater on `TrustRegistry` if factory-created wallets need scores tracked centrally
3. Consider renouncing ownership after the updater list is finalized, to make the registry fully immutable

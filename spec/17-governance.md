# Intelligence Layer 11: Governance

**Status:** DRAFT  
**Version:** 0.1.0  
**Created:** 2026-03-11

---

## Abstract

ARC-402 governance is intentionally narrow in v1. It is not a token politics system. It is an operator-controlled, auditable multisig layer for the mutable parts of the protocol.

The reference implementation uses `ARC402Governance`, a minimal N-of-M multisig that executes ordinary contract calls after reaching a configurable confirmation threshold.

---

## Scope of Governance

The governance layer is responsible for mutable protocol controls such as:
- token whitelist updates
- protocol parameter updates
- capability root registration / disablement
- ownership of governance-managed contracts

Examples:
- calling `GovernedTokenWhitelist.setToken(token, allowed)`
- calling `TrustRegistryV2.setMinimumAgreementValue(value)`
- calling `CapabilityRegistry.registerRoot(root)`
- calling `CapabilityRegistry.setRootStatus(root, active)`

---

## Design Principles

1. **Minimal surface area** — governance should be easy to audit.
2. **Explicit execution** — every mutation is a concrete transaction with calldata.
3. **Signer-based, not token-based** — this is operator governance, not tokenomics.
4. **Threshold safety** — a proposal cannot execute until the required signer threshold is reached.
5. **Ownership handoff** — mutable protocol contracts should transfer ownership to the multisig.

---

## Contract Model

`ARC402Governance` stores:
- signer set
- immutable threshold
- submitted transaction queue
- per-transaction confirmations
- executed status

Lifecycle:
1. signer submits transaction
2. submission auto-confirms by submitter
3. additional signers confirm
4. any signer executes once threshold is met
5. signers may revoke before execution

---

## Mutable vs Immutable

### Governed / Mutable
- token allowlists
- minimum agreement thresholds
- authorized updater lists (where ownership already exists)
- capability roots

### Prefer Immutable or New-Deployment Upgrade
- cryptographic verification logic
- wallet logic
- dispute core semantics
- trust algorithm constants that should not drift silently

If a component is too critical to mutate casually, ARC-402 should prefer deploying a new version and requiring explicit user opt-in.

---

## Operational Guidance

Production deployments SHOULD:
- use hardware-secured signer keys
- publish signer membership off-chain for transparency
- keep threshold >= 2 for any serious environment
- use governance ownership only on contracts that genuinely need mutation
- avoid bundling unrelated protocol risk into one admin surface

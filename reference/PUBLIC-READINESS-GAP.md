# ARC-402 Public Readiness Gap

## Status

ARC-402 is **viable for a closed pilot**.
ARC-402 is **not yet ready for open public launch**.

This document translates the reconciled mega audit into a concrete public-readiness gap statement.

---

## Executive Summary

The protocol is strong enough to justify continued investment and controlled deployment.
It is not yet institutionally mature enough to claim legitimacy as an open public policy-governed escrow and reputation rail.

The largest remaining problems are not "missing ideas" — they are **mismatches between the strongest story of the protocol and what the current implementation actually enforces**.

The main gaps are:
1. escrow lifecycle integrity
2. dispute legitimacy
3. ZK launch-readiness
4. docs / SDK / CLI / skill / doctrine alignment
5. truth-convergence quality in trust + reputation

---

## What Is Already Strong

These parts are directionally strong and worth preserving:
- governed wallet architecture
- policy engine model
- trust graph v2 direction
- capability taxonomy direction
- governance multisig direction
- operator doctrine direction
- CLI as universal adapter
- transport-agnostic architecture
- serious testing/audit discipline

The protocol is not conceptually weak.
The issue is that the final institutional layers are not yet coherent enough for public trust.

---

## Public Launch Blockers

## 1. Escrow Lifecycle Integrity Gap

### Problem
Two settlement paths still exist in practice:
- strong path: deliver → review → remediation → dispute → release
- weak path: immediate `fulfill()` release

This undermines the core claim of policy-governed escrow.

### Why this blocks public launch
An open public market cannot rely on a weaker parallel path that bypasses the more trustworthy lifecycle.

### Public-ready condition
A single, coherent escrow lifecycle must exist for public launch.

---

## 2. Dispute Legitimacy Gap

### Problem
Dispute authority is still effectively too centralized relative to the public doctrine.
The docs describe institutional dispute resolution. The implementation still does not fully embody it.

### Why this blocks public launch
Without credible dispute legitimacy, escrow and trust are socially weaker than advertised.

### Public-ready condition
Dispute authority must be explicitly institutionalized through:
- machine-verifiable path
- peer arbitration path
- human escalation path
- clear authority boundaries
- evidence-first process

---

## 3. ZK Readiness Gap

### Problem
The ZK layer is not semantically trustworthy enough for launch use.
The audit found mismatches and insufficient proof binding.

### Why this blocks public launch
A broken ZK layer creates false confidence and damages protocol credibility.

### Public-ready condition
Either:
- remove/quarantine ZK from launch path
- or fully redesign, test, and audit it as a real trust-bearing feature

Current recommendation: **quarantine ZK from public launch scope**.

---

## 4. Surface Integrity Gap

### Problem
The public surfaces are not yet perfectly aligned:
- contracts
- docs
- SDKs
- CLI
- OpenClaw skill
- operator doctrine
- portable operator standard

### Why this blocks public launch
Public trust is built at the surface. If the surfaces overstate enforcement, then the protocol makes promises it does not yet keep.

### Public-ready condition
Every surface must say exactly what the contracts enforce.
Nothing stronger. Nothing softer.

---

## 5. Trust Convergence Gap

### Problem
Trust/reputation still leans too much on throughput, coalition effects, optional attestations, and soft signaling.
Operational trust is also still self-reported.

### Why this blocks public launch
A public market needs stronger convergence toward truth than a pilot.

### Public-ready condition
- stronger arbitration-linked truth loops
- weaker weight on forgeable signals
- heartbeat/ops trust demoted from ranking-grade trust until externally anchored
- clearer separation between hard economic trust and soft social trust

---

## High-Risk Public Weaknesses (Not Always Immediate Blockers Alone, But Blocking In Combination)

## A. Remediation-first is doctrine more than enforcement
Direct dispute remains too available relative to the intended model.

## B. Heartbeat is informational, not authoritative
Useful for pilots. Not strong enough for ranking-grade public discovery.

## C. Sponsorship / identity tiers are not yet strong-trust primitives
They should not yet carry heavy trust weight.

## D. Canonical capability taxonomy coexists with free-text reality
Discovery truth is diluted until canonical capability use becomes primary.

## E. SDK / CLI command semantics can still imply stronger guarantees than exist
This is a public launch risk because users trust the interface more than the contracts.

---

## What ARC-402 Can Honestly Claim Right Now

### Honest today
- governed escrow/reputation infrastructure for controlled counterparties
- closed pilot infrastructure for agent-to-agent transactions
- operator-guided negotiation/remediation/dispute workflows
- transport-agnostic settlement architecture
- strong architectural direction toward public market readiness

### Not honest yet
- open public policy-governed escrow rail
- institutional-grade decentralized dispute legitimacy
- robust public trust market that converges strongly toward truth
- production-grade ZK trust path

---

## Public Readiness Criteria

ARC-402 should be considered public-ready only when the following are true:

### Escrow / lifecycle
- no weaker parallel settlement path remains
- remediation/dispute/finalization lifecycle is unified and enforced

### Dispute legitimacy
- dispute authority is no longer effectively owner-led
- arbitration path is credible and incentive-aligned
- evidence handling is first-class and bounded
- human escalation is explicit and sane

### Surface integrity
- docs/SDK/CLI/skill/doctrine fully align to enforcement reality
- no scaffold behavior is presented as fully live behavior

### Trust / reputation
- soft signals are demoted appropriately
- arbitration outcomes meaningfully strengthen truth convergence
- operational trust is clearly labeled informational unless independently observed

### Governance
- governance boundaries are clear and auditable
- capability taxonomy control is explicit and stable

### ZK
- either removed from launch scope or fully repaired and re-audited

---

## Readiness Ladder

### Stage 1 — Closed Pilot
Allowed once immediate blockers are cleaned and claims remain narrow.

### Stage 2 — Public Testnet Beta
Allowed after lifecycle unification, dispute-legitimacy progress, and surface alignment.

### Stage 3 — Limited Mainnet Deployment
Allowed after second mega audit pass and stronger governance/dispute/trust semantics.

### Stage 4 — Open Public Market
Allowed only once the institutional trust story is as strong as the technical story.

---

## Immediate Next Recommendation

Do not jump to public launch.

Do this instead:
1. fix immediate lifecycle and surface blockers
2. institutionalize dispute legitimacy
3. quarantine or fix ZK
4. align every public surface
5. rerun mega audit
6. decide whether ARC-402 is ready for public testnet beta

---

## Final Statement

ARC-402 is not failing.
ARC-402 is in the exact place serious protocols reach when they move from elegant architecture to real public responsibility.

The gap is not imagination.
The gap is legitimacy.

That is now the work.

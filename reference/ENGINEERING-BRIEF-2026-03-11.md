# ARC-402 Engineering Brief — 2026-03-11

## Status

ARC-402 is now beyond a wallet/payment primitive. It is a transport-agnostic, policy-governed, escrow-backed, reputation-driven coordination layer for autonomous agents.

The current protocol has strong foundations already built:
- governed wallets
- trust graph v2
- escrow/service agreements
- reputation oracle
- sponsorship attestation
- blocklist/shortlist
- endpoint stability tracking
- ZK extension path
- CLI / SDK direction

However, the design session identified the next required institutional layers before the protocol can be considered complete for launch.

---

## What ARC-402 Is

A shared public network where agents can:
- discover each other
- negotiate work
- hire and pay each other
- deliver and verify outcomes
- build portable trust
- resolve disagreements intelligently
- escalate to peer or human review where necessary

This must work across:
- HTTP / x402
- CLI
- WebSocket
- P2P
- event-driven systems
- direct on-chain coordination

x402 is one bridge. ARC-402 is the broader economic layer.

---

## Design Lock

### 1. Network Model
ARC-402 is one public network.

Not:
- fragmented private deployments
- siloed agency instances
- isolated trust graphs

Policies define boundaries. The network stays shared.

This means:
- independent agents participate directly
- agencies can run internal fleets on the same network
- enterprises can prefer internal agents first, then outsource to market
- trust remains portable across the economy

### 2. Privacy / Affiliation Model
Always public:
- agent identity
- capabilities
- trust score
- service history
- reputation signals

Optional / attested:
- agency sponsorship
- enterprise backing
- organizational affiliation

Protocol is neutral on affiliation.
We are not forcing public org charts.
We are not forcing private mode.

### 3. Core Stack (already built)
- ARC402Wallet
- AgentRegistry
- ServiceAgreement
- TrustRegistryV2
- PolicyEngine
- SettlementCoordinator
- ReputationOracle
- SponsorshipAttestation
- X402Interceptor
- CLI + SDK direction

This stack should now be extended, not rethought.

---

## Required Next Layers

## P0 — Institutional Trust (build first)

### A. Negotiated Remediation Layer
This sits BEFORE formal dispute.

New flow:
deliver → review → structured feedback → revise / defend / partial settle / human review → formal dispute if unresolved

Required properties:
- max 2 remediation cycles
- fixed 24h total remediation window
- structured client feedback schema
- structured provider response schema
- transcript hash-linked to agreement
- silence or timeout → eligible for formal escalation

Required states:
- REVISION_REQUESTED
- REVISED
- PARTIAL_SETTLEMENT
- MUTUAL_CANCEL
- ESCALATED_TO_HUMAN
- ESCALATED_TO_ARBITRATION

Design principle:
Dispute is not the first layer. Reflection is.

### B. Formal Dispute System
This is now mandatory.

#### Tier 1 — Automated Resolution
For machine-checkable criteria such as:
- file present
- schema valid
- deadline met
- required sections included
- output format correct

#### Tier 2 — Peer Arbitration
For subjective disputes.
Use high-trust domain-specific arbitrator agents.

Requirements:
- trust > configurable threshold in disputed capability
- no recent relationship with either disputing party
- stake / collateral requirement
- evidence review
- majority decision or weighted decision rule
- support partial resolution outcomes
- separate arbitration trust track

#### Tier 3 — Human Escalation
For:
- high-value disputes
- contested arbitration
- enterprise / legal sensitivity

Requirements:
- evidence submission window
- fixed adjudication deadline
- final backstop decision

#### Timeline Rules
- provider response deadline: 24h
- remediation window: 24h total
- arbitration selection: bounded
- unresolved dispute timeout: 30 days → client default protection

#### Evidence Model
Need on-chain evidence anchoring:
- evidence hash
- evidence URI
- evidence type
- submitter
- timestamp

Arbitrators judge in order:
1. original contract / acceptance criteria
2. evidence
3. remediation transcript

Not the other way around.

### C. Critical Bug Fixes Before Extension Work
Already surfaced by auditors and must be fixed first:
1. ServiceAgreement.dispute() must set resolvedAt
2. ServiceAgreement ↔ TrustRegistryV2 interface mismatch must be fixed
3. ARC402Wallet registry timelock must not allow indefinite re-proposal extension

---

## P1 — Protocol Formalization

### D. Capability Taxonomy
Loose strings are not enough.

Need:
- canonical capability taxonomy
- namespacing
- versioning
- specialization hierarchy
- anti-spam structure
- governance over top-level roots

Example:
legal.patent-analysis.us.v1
insurance.claims.coverage.lloyds.v1
compute.gpu.a100.inference.v1

### E. Governance Layer
Need explicit governance architecture for:
- token whitelists
- protocol parameter updates
- penalty weights
- capability roots / taxonomy governance
- mutable vs immutable parameters
- upgrade control

Implementation target:
- multi-sig governance contract
- transparent, auditable parameter changes

### F. Delivery Standards
ServiceAgreement must evolve beyond free-text shells.

Need:
- typed acceptance criteria
- structured result schemas
- structured failure types
- partial completion model
- milestone-compatible extension path

---

## P2 — Market Intelligence and Reliability

### G. Operational Trust
Discovery should eventually surface:
- uptime
- response history
- latency
- endpoint version changes
- failure rate

This likely extends AgentRegistry with endpoint monitoring / heartbeat data.

### H. Automation Blast Radius Controls
ReputationOracle / policy automation must be bounded.

Need:
- cooldowns on auto-WARN effects
- bounded auto-block behavior
- rate limits / anti-cascade logic
- no autonomous overreaction loops

### I. Identity Tiers
Optional verified provider class.

Need:
- attestation-based verification tier
- no forced KYC for the whole protocol
- optional higher-trust / higher-trust-ceiling classes for enterprise use

---

## P3 — Advanced Extensions (non-blocking)

### J. ZK Extensions
These are valuable, but not the core launch blocker.

Already scaffolded:
- ZK trust threshold proofs
- ZK solvency proofs
- ZK capability proofs

Do not let ZK delay the trust core:
- dispute legitimacy
- evidence model
- arbitration
- governance
- delivery standards

---

## Market Positioning Locked

ARC-402 now serves three simultaneous modes:
1. public marketplace
2. agency operations
3. enterprise fleets

And above all three:
The API economy.

Every company can become an agent service provider.
Every API can become discoverable, hireable, trust-tracked.
Every compute provider can become a governed service provider.

This includes:
- law firms
- claims intelligence systems
- syndicates
- GPU / compute markets
- SaaS APIs
- AI agencies
- enterprise internal fleets

---

## Build Priorities

### Immediate Build Order

#### Track 0 — Hardening fixes
- fix dispute timeout bug
- fix TrustRegistry interface mismatch
- fix registry timelock re-proposal issue
- reconcile auditor findings from delta audit

#### Track 1 — Institutional trust
- negotiated remediation layer
- formal dispute resolution contract/system
- evidence model
- partial settlement outcomes
- human escalation hooks

#### Track 2 — Formalization
- capability taxonomy registry/spec
- governance contract
- typed acceptance criteria spec / primitives

#### Track 3 — Reliability / control
- endpoint heartbeat / operational trust
- automation cooldowns / anti-cascade logic
- identity tier attestation extension

---

## Next Audit Scope
After implementation of the updated design, mega audit must cover:
- dispute legitimacy
- arbitration bribery/collusion
- remediation loop abuse
- evidence tampering
- partial settlement correctness
- reputation oracle poisoning
- capability spam / taxonomy abuse
- governance capture
- operational trust manipulation
- any ZK verifier / gate issues if included

This is no longer only a smart contract audit.
It is:
- contract security
- institutional security
- market security

---

## Final Statement
ARC-402 is now a transport-agnostic, policy-governed, escrow-backed, reputation-driven coordination layer for autonomous agents, with portable public trust, optional sponsorship, negotiated remediation, formal dispute resolution, and a self-correcting social trust layer.

From here, the protocol is not waiting to be invented.
It is ready to be implemented, stressed, and improved through use.

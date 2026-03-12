# ARC-402 Mega Audit Spec — 2026-03-11

## Purpose

This document defines the full audit engagement for ARC-402 after the protocol, governance, dispute/remediation, operator doctrine, SDKs, CLI, and skill surfaces were brought into alignment.

The goal is not a casual code review.
The goal is a **firm-grade, launch-readiness audit** covering:
- contract security
- economic security
- institutional/dispute security
- governance safety
- operator-surface correctness
- production readiness

---

## Audit Standard

This audit should approximate the quality bar of a serious external firm engagement.

That means:
1. fixed target scope
2. independent review perspectives
3. machine analysis stack
4. reconciled findings register
5. explicit launch recommendation
6. regression proof for fixed issues

---

## Phase 0 — Pre-Audit Freeze

Before running the mega audit, freeze the target.

### Freeze requirements
- lock audited commit SHAs
- ensure repo builds from clean state
- ensure full test suite passes from clean state
- ensure deploy scripts match current contract set
- ensure docs/README do not describe stale behavior
- ensure SDK/CLI surfaces reflect current contracts and workflow states
- ensure no placeholder / scaffold-only behavior is mislabeled as complete

### Freeze artifacts
Record:
- root repo commit
- protocol reference commit
- Python SDK commit
- TS SDK commit
- CLI commit
- skill commit
- operator doctrine / standard commit

### Scope labels
Every item must be labeled as one of:
- **in-scope critical surface**
- **in-scope informational surface**
- **out of scope**

---

## Audit Scope

## A. Smart Contract Scope
Primary on-chain contracts to audit:
- `ARC402Wallet.sol`
- `ARC402Registry.sol`
- `PolicyEngine.sol`
- `TrustRegistry.sol`
- `TrustRegistryV2.sol`
- `IntentAttestation.sol`
- `SettlementCoordinator.sol`
- `AgentRegistry.sol`
- `ServiceAgreement.sol`
- `ReputationOracle.sol`
- `SponsorshipAttestation.sol`
- `CapabilityRegistry.sol`
- `ARC402Governance.sol`
- `GovernedTokenWhitelist.sol`
- `ZKTrustGate.sol`
- `ZKSolvencyGate.sol`
- `ZKCapabilityGate.sol`
- generated verifier contracts
- any additional dispute/remediation support contracts if split out

### Also review
- interfaces
- deployment scripts
- current network config assumptions

## B. Off-Chain / Operator Surface Scope
Audit for correctness and claim alignment:
- Python SDK v0.2
- TypeScript SDK v0.2
- CLI v0.2
- OpenClaw ARC-402 skill
- operator doctrine docs
- portable operator standard docs

These are not audited like smart contracts, but they **are** audited for:
- abstraction correctness
- dangerous mismatch with protocol reality
- misleading workflow assumptions
- launch-risking UX/safety problems

---

## Phase 1 — Independent AI Audit Lenses

Because model/provider reliability is constrained, use **GPT-5.4 for all three roles** but enforce strict role separation and zero shared context.

## Auditor A — Attacker
### Role
Exploit developer / adversarial red team.

### Primary question
How do I steal funds, lock funds, poison trust, manipulate disputes, or damage competitors profitably?

### Focus areas
- escrow theft
- reentrancy
- griefing vectors
- trust farming
- reputation poisoning
- Sybil strategy
- capability spam abuse
- heartbeat spoofing
- arbitrator collusion or bribery
- governance capture
- cooldown bypasses
- ZK proof misuse
- identity-tier gaming

### Output style
Exploit-centric.
Every finding should explain:
- attack steps
- required capital/privilege
- economic payoff
- exploit cost

## Auditor B — Architect
### Role
Protocol architect / systems reviewer.

### Primary question
What invariants must hold, and where do they fail structurally?

### Focus areas
- state machine correctness
- trust/dispute/remediation composition
- governance boundaries
- economic convergence toward truth
- operator doctrine vs implementation consistency
- scalability assumptions (10 / 1,000 / 100,000 agents)
- institutional legitimacy of the dispute model

### Output style
Invariant-centric.
Every finding should explain:
- violated invariant
- systemic consequence
- scale behavior
- architecture-level recommendation

## Auditor C — Independent
### Role
Cold reviewer with no emotional attachment.

### Primary question
What looks reasonable but is actually wrong, incomplete, or inconsistent?

### Focus areas
- edge cases
- mismatched assumptions
- stale abstractions
- docs vs code divergence
- CLI/SDK misleading behavior
- line-level correctness gaps
- missing tests
- forgotten consequences of recent additions

### Output style
Sharp, practical, implementation-focused.

---

## Phase 2 — Machine Audit Stack

## Static analysis
Run and reconcile outputs from:
- Slither
- Aderyn
- solhint
- Semgrep
- Mythril
- 4naly3er

## Symbolic / property / fuzz
Run and reconcile outputs from:
- Halmos
- Forge fuzz / invariant tests
- Echidna
- Medusa (if useful and stable)
- Wake (if useful)

## Differential / regression analysis
- compare behavior against prior audited versions where useful
- regression-test every previously found critical/high issue
- ensure no prior fixes regressed in refactors

## ZK-specific analysis
Mandatory because verifier infrastructure exists.
Review:
- public signal ordering
- statement/proof binding correctness
- threshold semantics
- root semantics
- verifier contract assumptions
- trusted setup hygiene
- whether proof validity implies intended meaning

---

## Phase 3 — Workstreams

## Workstream A — Contract Security
Questions:
- Can funds be stolen?
- Can funds be permanently locked?
- Can authorized actions be spoofed or bypassed?
- Can governance mutate critical surfaces unsafely?
- Can contracts be griefed into unusable states?

## Workstream B — Economic Security
Questions:
- What is the cheapest path to fake trust?
- What is the cheapest path to suppress a competitor?
- Can WARN pressure be manufactured cheaply?
- Can remediation/dispute be weaponized as a griefing tool?
- Can taxonomy / discovery be SEO-spammed economically?
- Can operational trust be spoofed into premium discovery rank?

## Workstream C — Dispute & Arbitration Security
Questions:
- Are remediation loops bounded correctly?
- Are evidence rules enforceable enough?
- Can no-show logic be abused?
- Are partial resolution outcomes safe and coherent?
- Can arbitrators collude or be bribed profitably?
- Are human escalation hooks sane and non-breaking?
- Does timeout behavior protect the right party by default?

## Workstream D — Governance & Taxonomy Security
Questions:
- Can capability roots be captured?
- Can governance deadlock or misfire?
- Can whitelist changes break user funds or operations?
- Are namespace/version semantics resistant to spam and ambiguity?

## Workstream E — SDK / CLI / Operator Surface Audit
Questions:
- Do SDK abstractions imply stronger guarantees than contracts provide?
- Does CLI represent transport-neutral behavior honestly?
- Are dangerous flows too easy / safe flows too hard?
- Do docs create unsafe operator confidence?
- Are human escalation hooks visible enough?

---

## Required Invariants

The audit must explicitly test or reason about the following invariants.

## Escrow / settlement invariants
- escrow cannot move except through valid state transitions
- escrow cannot be released twice
- escrow cannot be partially released outside explicit allowed outcomes
- remediation cannot silently bypass dispute state controls
- timeout paths cannot be abused to skip waiting periods illegitimately

## Trust / reputation invariants
- trust cannot increase without a valid agreement outcome
- trust updates must correspond to real delivery/dispute outcomes
- auto-WARN cannot cascade unboundedly
- reputation signals cannot be duplicated outside intended policy
- arbitration trust cannot be earned without arbitration participation

## Governance invariants
- governance actions require configured quorum
- revoked confirmations must affect execution eligibility correctly
- root capability control must remain within governance authority
- mutable parameters must not bypass governance boundaries

## Operator invariants
- remediation is attempted before formal dispute unless explicitly skipped by allowed path
- high-risk classes must have human escalation hooks available
- evidence must be anchorable before final resolution
- plain CLI must not be documented as memory-native by default

## ZK invariants
- proof verification must bind to the intended public statement
- valid proof must imply correct threshold/root semantics
- verifier argument ordering must match circuit definition
- trusted setup artifacts must not include toxic waste

---

## Severity Model

Use two axes.

## 1. Security severity
- **CRITICAL** — direct theft, permanent lock, forged proof, governance takeover, invalid finality
- **HIGH** — major dispute/reputation/governance correctness failure with serious economic or launch impact
- **MEDIUM** — bounded abuse, manipulation, or correctness issue with contained blast radius
- **LOW** — minor correctness, observability, or operator-risk issue
- **INFO** — note, recommendation, or future-hardening item

## 2. Launch severity
- **BLOCKER** — do not launch without fix
- **PILOT-OK** — acceptable only for closed pilot / limited test deployment
- **MAINNET-LATER** — acceptable to defer with explicit documentation and guardrails

Both labels should appear in the final findings register.

---

## Findings Format

Every finding should include:
- ID
- title
- surface / file / module
- severity
- launch severity
- category (security / economic / governance / operator / zk / docs)
- description
- exploit path or failure path
- preconditions
- impact
- recommendation
- status (open / fixed / accepted / not reproducible)
- fixed-in commit (if applicable)

---

## Required Deliverables

## 1. Audit Scope Document
- audited commits
- in-scope files
- assumptions
- exclusions
- environment

## 2. Findings Register
Reconciled across all review sources.

## 3. Invariants Report
Which invariants hold, which are at risk, and why.

## 4. Regression Proof Pack
- tests added for important findings
- machine outputs
- references to regression cases

## 5. Readiness Recommendation
One of:
- not safe for public deployment
- safe for closed pilot only
- safe for public testnet beta
- safe for limited mainnet deployment
- safe for public mainnet launch

This recommendation must be explicit and justified.

---

## Reconciliation Process

1. Run all three AI audit roles independently.
2. Run the machine stack.
3. Merge findings into a single register.
4. Dedupe by root issue, not by wording.
5. Re-test criticals/highs manually where possible.
6. Fix launch blockers.
7. Re-run targeted checks on fixed areas.
8. Produce final readiness recommendation.

---

## Pre-Audit Execution Checklist

Before firing the mega audit, verify:
- [ ] all current implementation tracks are merged
- [ ] protocol contracts compile from clean state
- [ ] full contract test suite passes from clean state
- [ ] Python SDK builds and tests pass
- [ ] TS SDK builds and tests pass
- [ ] CLI builds and basic commands run
- [ ] skill/docs updates are committed
- [ ] README/spec links are not stale
- [ ] deploy scripts reflect current contract inventory
- [ ] no placeholder behavior is presented as production-ready
- [ ] audit output directories are set up cleanly

---

## Final Standard

This is the standard to hold:

ARC-402 should not just be “interesting” or “innovative.”
It should be **auditable, legible, adversarially reviewed, operationally honest, and safe enough to justify trust.**

That is the bar for the mega audit.

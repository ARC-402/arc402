# ARC-402 Final Sealing Audit Plan

## Purpose

This is the final audit plan to move ARC-402 from:
- post-remediation candidate

to:
- a truly sealed technical and institutional release candidate.

Unlike the earlier mega audit, this plan explicitly includes:
- three-perspective review
- full machine audit stack
- regression proof pack
- clean freeze discipline
- final launch recommendation

This is the audit meant to "seal the deal."

---

## Preconditions

Do not run this audit until the current public-readiness spine is complete.

Required before starting:
- Step 3.1 settlement lifecycle unification complete
- Step 3.2 remediation-first enforcement complete
- Step 3.3 dispute legitimacy / arbitration authority complete
- support tracks merged
- docs/surfaces aligned
- repo merged into one clean auditable target

If these are not true, this audit is premature.

---

## Phase 0 — Clean Freeze

This phase is mandatory.

### Freeze checklist
- [ ] all target changes merged
- [ ] worktree clean
- [ ] contract repo builds from clean checkout
- [ ] full forge test suite passes from clean checkout
- [ ] Python SDK builds/tests pass from clean checkout
- [ ] TS SDK builds/tests pass from clean checkout
- [ ] CLI builds from clean checkout
- [ ] deploy scripts reflect current contract inventory
- [ ] README/specs/docs reflect actual current behavior
- [ ] experimental features clearly labeled
- [ ] audited commit SHA recorded

### Freeze artifacts to produce
- `AUDIT-TARGET-SHA.txt`
- `AUDIT-SCOPE.md`
- `AUDIT-ASSUMPTIONS.md`
- `AUDIT-EXCLUSIONS.md`

This is what makes the audit reproducible.

---

## Audit Layers

# Layer 1 — Three-Perspective Review

Use the same three-role approach, but now against the frozen release candidate.

## Auditor A — Attacker
Role:
- exploit developer
- griefing designer
- economic attacker
- adversarial operator

Focus:
- theft
- lockups
- griefing
- reputation poisoning
- trust farming
- arbitration collusion
- governance capture
- heartbeat spoofing
- identity gaming
- any remaining ZK risk if ZK is still in scope

Output:
- exploit-centric report
- cost-to-execute estimates
- composite attack chains
- launch blockers

## Auditor B — Architect
Role:
- protocol architect
- invariant reviewer
- institutional systems auditor

Focus:
- lifecycle coherence
- dispute legitimacy
- truth convergence
- governance correctness
- taxonomy coherence
- institutional safety at scale
- whether public claims now match technical truth

Output:
- invariant-centric report
- scale-risk analysis
- architecture verdict

## Auditor C — Independent
Role:
- cold skeptical reviewer
- drift finder
- edge-case catcher

Focus:
- docs/code drift
- CLI/SDK mismatch
- weird state-machine edge cases
- test blind spots
- generated artifact correctness
- public-facing sharp edges

Output:
- practical correctness report
- coverage gaps
- launch-readiness sharp edges

---

# Layer 2 — Full Machine Audit Stack

This is the full technical sealing pass.

## Static analysis
Run and reconcile:
- Slither
- Aderyn
- solhint
- Semgrep
- Mythril
- 4naly3er

## Property / symbolic / fuzz
Run and reconcile:
- Halmos
- Forge fuzz
- Forge invariant tests
- Echidna
- Medusa (if stable/useful)
- Wake (if useful)

## ZK-specific layer
Run only if ZK remains in release scope.
If ZK is still out of scope, mark as excluded from sealing decision.

If in scope, audit:
- verifier/public input ordering
- proof/statement binding
- state anchoring
- trusted setup artifacts
- semantic meaning of successful proofs
- root and threshold semantics

## Differential / regression layer
- compare behavior before/after remediation work
- regression-test every prior blocker
- ensure no previous high/critical issue reappeared

---

# Layer 3 — Surface Integrity Audit

The sealing audit must include surfaces beyond contracts.

## In scope
- Python SDK
- TypeScript SDK
- CLI
- OpenClaw skill
- operator doctrine docs
- portable operator standard docs
- deploy scripts

## Questions
- do they imply only what is actually enforced?
- do they hide any dangerous assumptions?
- do they normalize any still-unsafe behavior?
- are risky/experimental paths clearly isolated?
- do operators get a truthful picture of what the protocol does?

This is mandatory because public trust is formed here.

---

## Contract Scope

Expected in-scope contracts at sealing time:
- `ARC402Wallet.sol`
- `ARC402Registry.sol`
- `PolicyEngine.sol`
- `TrustRegistry.sol`
- `TrustRegistryV2.sol`
- `IntentAttestation.sol`
- `SettlementCoordinator.sol`
- `AgentRegistry.sol`
- `ServiceAgreement.sol`
- dispute/arbitration-related contracts
- `ReputationOracle.sol`
- `SponsorshipAttestation.sol`
- `CapabilityRegistry.sol`
- `ARC402Governance.sol`
- `GovernedTokenWhitelist.sol`
- ZK gate contracts only if they are in launch scope
- verifier contracts only if they are in launch scope

---

## Required Invariants to Seal

The final sealing audit must explicitly confirm or reject the following.

## Escrow invariants
- escrow cannot be released outside the allowed lifecycle
- no weak parallel settlement path exists in launch scope
- remediation/dispute/finalization transitions are coherent
- partial resolution accounting is exact
- timeout paths cannot illegitimately skip required waiting logic

## Dispute invariants
- remediation is the enforced default except for narrow explicit exceptions
- dispute authority is no longer effectively owner-led
- evidence is first-class in resolution
- no-show behavior protects the right party by default
- arbitration/escalation hooks are coherent and bounded

## Trust invariants
- trust cannot rise without real outcome-backed events
- weak signals do not overpower harder truth-linked signals
- reputation automation is bounded
- heartbeat cannot masquerade as authoritative operational truth

## Governance invariants
- authority is explicit
- execution requires quorum
- mutable parameters remain within intended governance control
- taxonomy root control remains bounded and auditable

## Surface invariants
- docs/SDK/CLI/skill/doctrine match enforcement reality
- experimental features are not presented as mature
- public launch claims are truthful

## ZK invariants (only if in scope)
- proof validity implies intended meaning
- public signal ordering is correct
- caller/state binding is correct
- trusted setup is clean and auditable

---

## Severity Model

Use dual classification.

## Security severity
- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFO

## Launch severity
- BLOCKER
- PILOT-OK
- TESTNET-OK
- MAINNET-LATER

The final sealing report must use both.

---

## Required Deliverables

## 1. Sealing Audit Scope Pack
- audited SHA
- scope files
- assumptions
- exclusions

## 2. Three-Perspective Reports
- attacker
- architect
- independent

## 3. Machine Audit Pack
- tool outputs
- deduped issues
- reproducibility notes

## 4. Findings Register
Each issue with:
- ID
- severity
- launch severity
- category
- description
- recommendation
- status
- fixed-in commit if resolved

## 5. Regression Proof Pack
For every prior blocker/high:
- test proving fix
- reference to patch
- no regression note

## 6. Final Readiness Recommendation
Must conclude with one of:
- closed pilot only
- public testnet beta
- limited mainnet deployment
- open public market launch

No ambiguity.

---

## Reconciliation Process

1. run all three perspective audits
2. run machine stack
3. merge findings by root issue
4. manually verify criticals/highs where possible
5. fix blockers
6. rerun targeted checks
7. produce final readiness judgment

---

## Exit Criteria

The protocol is considered sealed only if:
- no unresolved BLOCKER remains
- no experimental feature is silently inside launch scope
- all major invariants are confirmed or consciously deferred with honest launch classification
- docs and tools no longer overstate reality
- launch recommendation is defensible

---

## Final Principle

A protocol is not sealed because the code is elegant.
A protocol is sealed when:
- the code,
- the incentives,
- the institutions,
- the operator surfaces,
- and the public claims

all say the same true thing.

That is the standard for ARC-402.

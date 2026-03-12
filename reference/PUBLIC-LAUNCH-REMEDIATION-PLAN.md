# ARC-402 Public Launch Remediation Plan

## Purpose

This document converts the reconciled mega audit into an execution plan.

It is not another design discussion.
It is the sequence of work required to move ARC-402 from:
- closed-pilot viable

to:
- public-testnet beta candidate
- then limited mainnet candidate

---

## Current Readiness

### Current truthful status
- **Closed pilot:** viable
- **Public launch:** not ready

### Why
The remaining issues are now concentrated in a few areas:
1. weak/parallel lifecycle paths
2. dispute legitimacy gap
3. ZK launch-scope confusion
4. public surface drift
5. trust/reputation convergence weakness

---

## Remediation Sequence

The work must be sequential. Later stages depend on earlier ones.

# Phase 1 — Remove Public Launch Blockers

## Objective
Make the system honest enough for a future public-testnet beta.

---

## Step 1.1 — Unify the settlement lifecycle

### Problem
A weaker immediate-release path (`fulfill()`) still exists beside the stronger deliver→review→remediation→dispute→release path.

### Goal
One coherent settlement lifecycle.

### Required action
- remove the ability for `fulfill()` to behave as a production-grade shortcut
- choose one of:
  1. fully deprecate `fulfill()`
  2. restrict it to an explicitly legacy / trusted-only mode
  3. internally route it through the same verification/remediation machinery

### Preferred resolution
**Preferred:** deprecate or internally demote `fulfill()` for public launch scope.

### Success condition
No public-facing flow can claim escrow integrity while bypassing review/remediation.

---

## Step 1.2 — Enforce remediation-first where intended

### Problem
Doctrine says remediation precedes dispute, but direct dispute is still too easy in implementation/surfaces.

### Goal
Remediation becomes the default institutional path.

### Required action
- define explicit conditions where direct dispute is allowed:
  - no delivery
  - hard deadline breach
  - fraud / clearly invalid deliverable
  - safety-critical violation
- otherwise require remediation path first
- align contract state machine, SDK flows, CLI commands, and docs

### Success condition
The public system behaves like the doctrine says it behaves.

---

## Step 1.3 — Quarantine ZK from launch scope

### Problem
ZK currently creates false assurance because the trust semantics are not yet strong enough and the current implementation was flagged as unreliable.

### Goal
Do not let experimental privacy machinery contaminate launch legitimacy.

### Required action
- remove ZK from public launch claims
- label as experimental / roadmap / non-launch scope
- disable from default CLI/SDK happy paths where appropriate
- add explicit warnings where still present

### Optional later branch
Reintroduce only after:
- semantic redesign
- dedicated ZK review
- targeted audit pass

### Success condition
No user can reasonably believe ZK is launch-grade when it is not.

---

## Step 1.4 — Surface alignment pass

### Problem
Contracts, docs, SDKs, CLI, skill, doctrine, and operator standard do not yet fully align.

### Goal
Every public surface says only what the current implementation enforces.

### Required action
Audit and align:
- README
- spec docs
- operator docs
- operator standard
- OpenClaw skill
- Python SDK examples
- TS SDK examples
- CLI help text / command descriptions

### Alignment rules
- no stronger claim than actual enforcement
- no “decentralized” claim if owner still controls outcome
- no “automatic truth” framing where signals are still soft
- no “memory-native” CLI claim without OpenClaw-managed routing

### Success condition
A public reader cannot be misled by the docs or tool surfaces.

---

# Phase 2 — Institutionalize Dispute Legitimacy

## Objective
Turn dispute handling from a promising architecture into a credible institutional system.

---

## Step 2.1 — Finalize the dispute authority model

### Goal
Make authority explicit and layered.

### Required action
Implement or complete the authority stack:
- Tier 1: automated machine-verifiable resolution
- Tier 2: peer arbitration
- Tier 3: human escalation backstop

### Needed design choices
- who selects arbitrators
- stake mechanics
- majority / weighted rule
- appeal rules
- no-show rules
- timeout default
- partial-resolution rules

### Success condition
The dispute system is no longer effectively owner-led in practice.

---

## Step 2.2 — Make evidence first-class

### Goal
Evidence becomes a proper dispute primitive, not just supporting commentary.

### Required action
- standardize evidence structure
- define evidence types
- define submission windows
- define admissibility assumptions
- define evidence ordering in adjudication
- define transcript binding between remediation and dispute

### Success condition
Every dispute is evidence-led, not opinion-led.

---

## Step 2.3 — Tighten partial-resolution correctness

### Goal
Partial settlements are safe, coherent, and non-exploitable.

### Required action
- verify all split outcomes
- ensure escrow accounting remains exact
- ensure dispute/reputation consequences match partial outcomes
- ensure appeals do not create accounting contradictions

### Success condition
Partial outcomes cannot create fund leakage or broken reputation semantics.

---

# Phase 3 — Strengthen Trust Convergence

## Objective
Reduce the gap between trust score and real truth.

---

## Step 3.1 — Reweight soft vs hard signals

### Problem
Reputation still leans too much on coalition effects, throughput, optional attestations, and soft signaling.

### Required action
- reduce weight of manually forgeable signals
- increase weight of harder truth-linked outcomes
- tie dispute/arbitration results more strongly into trust consequences

### Success condition
Trust scores become harder to game socially.

---

## Step 3.2 — Demote weak trust inputs

### Inputs to demote for now
- self-reported heartbeat / latency as ranking-grade trust
- sponsorship as strong trust signal
- optional identity tiers as if they are robust truth anchors

### Success condition
Weak signals remain informational unless and until independently strengthened.

---

## Step 3.3 — Canonicalize discovery

### Problem
Canonical taxonomy now exists, but free-text realities still dilute discovery.

### Required action
- make canonical capabilities primary in registry/SDK/CLI
- degrade free-text role to informational compatibility layer
- update discovery ranking rules accordingly

### Success condition
Discovery becomes cleaner, less gameable, and more legible.

---

# Phase 4 — Production Discipline

## Objective
Prepare a truly auditable target for the next audit round.

---

## Step 4.1 — Clean freeze

### Required action
- merge current work into a clean state
- eliminate worktree drift
- produce one exact audit target
- re-run all test/build surfaces from clean checkout

### Success condition
The next audit is against one exact release candidate.

---

## Step 4.2 — Regression pack

### Required action
For every major issue fixed, add:
- regression test
- reasoning note
- fixed-in commit reference
- launch severity note

### Success condition
No resolved blocker can silently reappear.

---

## Step 4.3 — Rerun mega audit

Only after Phases 1–4 above.

### Required rerun scope
- attacker lens
- architect lens
- independent lens
- machine audit stack
- targeted review of fixed surfaces
- targeted review of any remaining experimental ZK path

### Success condition
Produce an updated readiness recommendation.

---

## Recommended Implementation Order

### Immediate build order
1. settlement lifecycle unification
2. remediation-first enforcement
3. public-surface alignment
4. quarantine ZK from launch scope
5. formal dispute authority implementation
6. evidence formalization
7. trust-weighting cleanup
8. discovery/taxonomy cleanup
9. clean freeze
10. audit rerun

---

## Launch Gates

## Gate A — Closed pilot
Allowed now, with controlled counterparties and honest claims.

## Gate B — Public testnet beta
Allowed only after Phase 1 completion and meaningful Phase 2 progress.

## Gate C — Limited mainnet
Allowed only after Phase 2 + Phase 3 completion and audit rerun.

## Gate D — Open public market
Allowed only when:
- dispute legitimacy is institutionally credible
- trust convergence is materially stronger
- surfaces are aligned
- no experimental layer is masquerading as mature

---

## Final Principle

The protocol does not need a new vision.
It needs stricter truth between:
- what it claims
- what it enforces
- and what the market can safely trust.

That is the remediation path.

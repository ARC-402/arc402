# ARC-402 Launch Readiness PRD
*Status: Active*
*Owner: Engineering (Forge)*
*Created: 2026-03-19*

---

## 1. Purpose

This document is the working launch-readiness PRD for ARC-402.

It exists to turn the current state of the protocol, CLI, SDKs, web onboarding, OpenClaw/OpenShell runtime, docs, and GitHub-facing materials into a single tracked plan that can be updated until launch.

This is not a vision doc. It is an execution tracker.

---

## 2. Current truths

### Already true
- ARC-402 v1, v2, v3, v4, and active v5 are live on Base mainnet.
- Launch docs now frame OpenShell as the runtime home.
- Launch web hub, onboarding, passkey pages, and signing pages are live.
- Device E2E for the onboarding path has been completed once already.
- Phase 2 items remain excluded from launch:
  - Privy / email / social onboarding
  - gas sponsorship / paymaster path

### Still true
- We need a clean, explicit launch-readiness pass across docs, runtime, setup, and GitHub-facing surfaces.
- OpenShell is not installed on the current PC yet.
- Docker is not installed on the current PC yet.
- We still need a from-scratch OpenClaw/OpenShell setup validation path, especially for the MacBook install.

---

## 3. Launch objective

Ship a launch-ready ARC-402 experience where an operator can:

1. understand what ARC-402 is and is not
2. choose a clear onboarding path
3. deploy and configure an ARC-402 wallet
4. register a passkey and approve governance actions
5. run the ARC-402 runtime through OpenClaw inside OpenShell
6. register an agent and participate in protocol flows
7. understand supported payment/agreement patterns
8. verify setup from docs without founder hand-holding

---

## 4. Launch paths we must support clearly

### Path A — Mobile-first onboarding
Best for operators who want the fastest path to a wallet and passkey.

Flow:
1. open `app.arc402.xyz/onboard`
2. deploy wallet
3. register passkey
4. optionally apply policy
5. optionally register agent
6. continue into OpenClaw/OpenShell operator setup

### Path B — CLI-first onboarding
Best for technical operators who want to start from local runtime and config.

Flow:
1. install CLI / OpenClaw
2. configure ARC-402 locally
3. deploy or connect wallet
4. use mobile pages for passkey-related signing when needed
5. initialize OpenShell runtime path
6. start the ARC-402 runtime

### Requirement
README and getting-started docs must present these as explicit choices, not an implied single route.

---

## 5. Definition of launch-ready

ARC-402 is launch-ready when all of the following are true:

### Product truth
- [ ] README accurately explains ARC-402, launch scope, and onboarding choices
- [ ] docs explain every launch-scope feature with scenarios
- [ ] phase 2 and post-launch boundaries are explicit everywhere

### Runtime truth
- [ ] OpenShell install/init/status flow is tested locally on PC
- [ ] OpenShell install/init/status flow is tested from scratch on MacBook
- [ ] daemon startup works through the OpenShell-owned path
- [ ] daemon restart behavior preserves OpenShell wrapping
- [ ] policy extension flow is documented and tested

### Operator truth
- [ ] mobile onboarding path is documented end to end
- [ ] CLI-first operator path is documented end to end
- [ ] passkey-sign approval flow is documented end to end
- [ ] agent registration path is documented with real endpoint requirements

### Protocol truth
- [ ] CLI command surface is aligned with launch-scope protocol actions
- [ ] SDKs are aligned with current deployed protocol surface
- [ ] docs do not overclaim unsupported payment primitives
- [ ] launch-safe examples exist for one-time, recurring, multi-step, escrow, and API/session patterns

### GitHub truth
- [ ] repo diff is cleaned and intentional
- [ ] generated artifacts are separated from meaningful changes
- [ ] GitHub-facing docs are coherent enough for first public readers
- [ ] launch checklist exists and is current

---

## 6. Ergonomics smoothing findings

### Friction patterns found in the current launch path
- OpenShell compatibility details are still too visible in operator-facing copy; ARC-402 should absorb those quirks instead of making users reason about CLI/version differences.
- The mobile-first vs CLI-first choice exists, but the docs still make the operator mentally compose the two surfaces instead of explicitly telling them what belongs on phone vs machine.
- The OpenClaw skill path still risks feeling bolted on unless README / getting-started / skill copy all tell the same "install once, then operate through arc402" story.
- SDK naming still leans contract-centric; operator-centric aliases make the intended mental model easier to discover without a full architecture read.
- GitHub-facing docs are strongest when they tell one simple story: choose a path, get a wallet, approve with passkey, run through OpenShell-contained runtime.

### Smoothing tasks added for launch
- [ ] Make all operator-facing docs describe OpenShell as an implementation detail absorbed behind ARC-402 commands wherever possible
- [ ] Add one canonical install phrase for the OpenClaw skill path and use it consistently across README, getting-started, CLI docs, and skill docs
- [ ] Add a simple "phone vs machine" table to README/getting-started
- [ ] Keep SDK operator aliases (`ARC402OperatorClient`, `ARC402Operator`) documented and stable through launch
- [ ] Add a short troubleshooting note for OpenShell 0.0.10+ compatibility so users never need to care which provider/sandbox flags changed

## 6A. Workstreams

## WS1 — Documentation truth
**Goal:** make documentation exhaustive, accurate, and choice-driven.

### Tasks
- [ ] Add explicit onboarding choice section to `README.md`
- [ ] Add explicit onboarding choice section to `docs/getting-started.md`
- [ ] Verify `docs/launch-scope.md` covers every launch feature with examples
- [ ] Add launch architecture diagram: OpenClaw + OpenShell + ARC-402
- [ ] Add clear “what is phase 2” section in README/docs
- [ ] Add “operator FAQ” section for owner-facing agent explanations

### Deliverables
- Updated `README.md`
- Updated `docs/getting-started.md`
- Updated `docs/launch-scope.md`

---

## WS2 — OpenShell runtime validation
**Goal:** prove the actual runtime path on real machines.

### Tasks
- [ ] Install Docker on current PC
- [ ] Install OpenShell on current PC
- [ ] Run `arc402 openshell init`
- [ ] Run `arc402 openshell status`
- [ ] Inspect generated policy and provider setup
- [ ] Run `arc402 daemon start` through OpenShell-owned path
- [ ] Record exact behavior, logs, errors, and friction points
- [ ] Test policy add/list/remove flows
- [ ] Document which outbound policies are needed for:
  - Base RPC
  - relay
  - bundler
  - Telegram
  - OpenAI / Anthropic / other harness APIs where relevant
- [ ] Repeat from scratch on MacBook

### Questions this workstream must answer
- What does the first-time setup actually feel like?
- Which dependencies are missing by default?
- Which policies can be set cleanly today?
- How does daemon/node behavior look inside OpenShell in practice?
- What is confusing enough to block launch adoption?

### Deliverables
- Updated setup docs
- OpenShell troubleshooting notes
- launch-safe default policy guidance

---

## WS3 — Runtime / CLI truth
**Goal:** make sure the user-facing runtime story matches the actual command behavior.

### Tasks
- [ ] Verify daemon help text and errors consistently point to OpenShell-first flow
- [ ] Verify direct daemon fallback is documented as dev/recovery only
- [ ] Verify passkey-sign links and governance approval copy are accurate
- [ ] Verify agent registration guidance is aligned with real endpoint metadata needs
- [ ] Verify notifier/alert language does not imply remote approval UX that does not exist

### Deliverables
- CLI copy cleanup
- docs/spec cleanup
- troubleshooting guidance

---

## WS4 — Protocol / SDK / docs alignment
**Goal:** make public docs and tooling map to the actual protocol surface.

### Tasks
- [ ] Map contracts → public/external functions → CLI / SDK / docs coverage
- [ ] Verify launch-scope functions are represented in CLI where intended
- [ ] Verify TypeScript SDK types match active contract behavior
- [ ] Verify Python SDK types match active contract behavior
- [ ] Verify OpenClaw skill docs reflect launch truth
- [ ] Verify payment pattern documentation never invents unsupported primitives

### Deliverables
- coverage matrix
- mismatch list
- final launch-safe examples

---

## WS5 — GitHub polish prep
**Goal:** make the repo presentable without mixing unrelated work.

### Tasks
- [ ] isolate intentional launch files from unrelated dirty files
- [ ] remove or separate generated build artifacts where appropriate
- [ ] review the three launch commits as the canonical baseline
- [ ] assemble final README / docs nav order
- [ ] prepare launch checklist for repo root or docs

### Deliverables
- cleaned diff plan
- GitHub polish checklist

---

## 7. Immediate next actions

### Today
- [ ] Update README with onboarding choice section
- [ ] Update getting-started with onboarding choice section
- [ ] Mark device E2E as completed-once, with MacBook rerun still pending
- [ ] Test local OpenShell prerequisites on current PC
- [ ] Document current PC blockers: Docker + OpenShell absent

### Next validation pass
- [ ] install Docker on PC
- [ ] install OpenShell on PC
- [ ] initialize ARC-402 OpenShell sandbox
- [ ] inspect sandbox policies and providers
- [ ] start daemon through OpenShell path
- [ ] capture exact setup notes for MacBook rerun

---

## 8. Tracking table

| Workstream | Status | Owner | Next action |
|---|---|---|---|
| WS1 Documentation truth | In progress | Forge | Add onboarding choice sections |
| WS2 OpenShell runtime validation | Blocked on local prerequisites | Forge | Install Docker on PC |
| WS3 Runtime / CLI truth | In progress | Forge | Verify OpenShell-first wording everywhere |
| WS4 Protocol / SDK / docs alignment | In progress | Forge | Build explicit coverage matrix |
| WS5 GitHub polish prep | Pending | Forge | Isolate intentional launch diff |

---

## 9. Decisions locked

- OpenShell owns runtime startup for launch.
- `arc402 daemon start` remains the command surface, but not the standalone architecture story.
- Device E2E has been completed once already and should be rerun from a clean MacBook setup.
- Phase 2 stays out of launch messaging:
  - Privy / email onboarding
  - gas sponsorship

---

## 10. Update protocol

Whenever launch-readiness changes materially, update:
- this file
- `products/arc-402/ENGINEERING-STATE.md`
- `memory/2026-03-19.md` or the current daily memory file

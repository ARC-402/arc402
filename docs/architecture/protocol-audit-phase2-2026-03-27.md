# ARC-402 Protocol Audit — Phase 2
**Subsystem Reality Audit: Contracts · CLI · SDKs · Plugin · Web · Workroom · Provisioner**

**Date:** 2026-03-27
**Author:** Forge (Engineering)
**Reads from:** actual repo files, package.json, README.md, engineering state
**Follows from:** Phase 1 (AUDIT-PHASE-1-TRUTH-MAP-2026-03-26.md)

---

## Overall Verdict

Phase 1 said: *"ARC-402 is real, but surface coherence is weak."*

Phase 2 confirms that, and gets specific.

**The four actual problems (prioritized):**

1. **README has stale deployed addresses** — PolicyEngine, WalletFactory, MigrationRegistry are all wrong
2. **README install path contradicts itself** — three different install instructions for OpenClaw users, one of which uses a wrong package name
3. **Version badge says `v1.0` but CLI is at `1.4.33`** — signals confusion about what version the user is actually getting
4. **Python SDK is labeled `Alpha`** — conflicts with "mainnet production" protocol positioning

Everything else is either minor drift or real but acceptable complexity.

---

## Subsystem Audit

---

### 1. CONTRACTS

**Present:** `contracts/src/ARC402RegistryV3.sol`, `ComputeAgreement.sol`, `SubscriptionAgreement.sol`

**Reality:**
- 3 public contracts in the repo (correct — core v3 surface)
- Full test suite: `test/` covers `ARC402RegistryV3.t.sol`, `ComputeAgreement.t.sol`, `ComputeAgreement.attacker.t.sol`, `SubscriptionAgreement.t.sol`, `SubscriptionAgreement.attacker-v2.t.sol`, `HalmosSubscriptionCheck.t.sol`
- Deploy scripts present for all three
- Audit artifacts present (via `docs/AUDIT-REPORT-COMPUTE-FINAL.md`)

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| README `Tests: 612 passing` badge | Actual test functions in `test/*.sol`: 214. The 612 number is not auditable from the public repo — likely includes historical test count or counting total assertions, not test functions. Needs correction or clarification. | Medium |
| README shows ServiceAgreement, SessionChannels, etc. | These are v1/v2 contracts not in `contracts/src/` — public repo only ships v3 surface. That's fine, but the README address table doesn't distinguish clearly which generation is "install this" vs "deployed infrastructure." | Medium |
| No `ServiceAgreement.sol` in `contracts/src/` | ServiceAgreement is the most-used contract in the protocol. It's not in the public contracts directory. Operators can't read the contract they're hiring against. Intentional? If so, explain in README. | High |

**Alignment score:** Strong — the contracts that are public are right, deep, and audited. The gap is around what's exposed vs what's deployed.

---

### 2. CLI

**Present:** `cli/src/commands/` — 38 command files. `arc402-cli@1.4.33`.

**Reality:**
- CLI is deep and real: hire, accept, deliver, verify, workroom, compute, subscribe, wallet, tunnel, arena, dispute, discover, negotiate, channel, policy, trust, watchtower, feed, doctor, setup, coldstart...
- Workroom integration is real (`workroom.ts` is well-structured, notifies daemon, manages Docker lifecycle)
- `--use-eoa` flag exists for workaround path
- `openshell.ts` still present (legacy path)

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| README shows `arc402 agent claim-subdomain` | Not in `cli/src/commands/agent.ts` — this appears to be an older or aspirational command. Check before launch. | High |
| README `v1.0` banner in ASCII art | CLI is actually at `1.4.33`. This creates a mismatch between what the README signals and what `arc402 --version` returns. Users will be confused immediately. | High |
| `daemon.ts` still in commands | There is still a `daemon.ts` alongside `workroom.ts`. The terminology decision was "workroom, not daemon" — but the command still exists. | Medium |
| `openshell.ts` still present | OpenShell framing was deprecated in favor of workroom. This command should either be removed or clearly marked as legacy. | Medium |
| CLI-SPEC.md visual design spec | Is no longer the truth source. Commands added since (compute, subscribe, workroom, arc identity, etc.) are not in it. Should be marked historical. | Low |

**Alignment score:** Excellent on substance. Needs surface polish (version badge, stale commands, README command accuracy).

---

### 3. TYPESCRIPT SDK

**Present:** `@arc402/sdk@0.6.3`

**Reality:**
- SDK README is clean and accurate
- Launch-scope note present (ZK explicitly out of scope)
- `npm install @arc402/sdk ethers` is the correct install path
- Content covers: discovery, negotiation, hiring, delivery, disputes, reputation, governance

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| TS SDK README has a duplicated paragraph | Two consecutive blocks begin with "Typed TypeScript SDK for..." — minor copy artifact. | Low |
| SDK version (0.6.x) vs protocol "v1.0" positioning | The protocol claims `v1.0` maturity in README but the SDK is at `0.6.3`. This doesn't technically conflict but reads as unresolved. | Low |

**Alignment score:** Strong. Cleanest subsystem from a docs perspective.

---

### 4. PYTHON SDK

**Present:** `arc402@0.5.4`

**Reality:**
- Full module: `__init__.py`, `abis.py`, `agent.py`, `agreement.py`, `bundler.py` and more
- Well structured, real coverage

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| `pyproject.toml` status: `"Development Status :: 3 - Alpha"` | This is published to PyPI and used in production mainnet agreements. `Alpha` directly conflicts with the protocol's production-launch positioning. Should be `4 - Beta` minimum, ideally `5 - Production/Stable` at launch. | High |
| Python version string `0.5.4` vs `v1.0` protocol | Same coherence tension as TS SDK — fine for now but needs resolving at 1.0 tag. | Low |

**Alignment score:** Good implementation, but PyPI classification is a trust signal to developers and it's currently wrong for launch.

---

### 5. PLUGIN

**Present:** `@arc402/arc402@1.3.4`

**Reality:**
- Package name: `@arc402/arc402` ✅
- `openclaw.plugin.json` version: `1.0.1` (internal plugin manifest)
- Description in manifest: clean and accurate
- Plugin ID: `arc402`

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| README line 48: `openclaw plugins install @arc402/openclaw-plugin` | Wrong. The actual package is `@arc402/arc402`. This is the #1 confirmed mismatch from Phase 1. An OpenClaw operator who follows this instruction will get an error. | **Critical** |
| `getting-started.md` line 93: same wrong command | Same broken install path in the getting-started guide. Both the README and the main operator guide have this error. | **Critical** |
| `openclaw.plugin.json` internal version `1.0.1` vs npm published `1.3.4` | Plugin manifest version is not auto-synced with the npm package version. They diverge. Minor but notable. | Low |

**Alignment score:** Code is correct. Two public-facing install instructions are broken.

---

### 6. WEB / LANDING / ONBOARDING

**Present:** `landing/`, `arena/`, and `web/` (untracked from public surface)

**Reality:**
- `landing/` — built out, deployed to `arc402.xyz`
- `arena/` — Next.js, built, has `arena/app/agents/page.tsx`, subgraph integration
- `web/` — exists locally, untracked from public repo (correctly)

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| `landing/` content not audited here (no direct read) | Would need a separate pass to verify all content matches current launch framing. Flag for Phase 3. | Medium |
| Arena (`arena/`) is public in repo but appears to use a subgraph | Subgraph is untracked (correctly), but the arena site depends on `arena/lib/subgraph.ts`. If subgraph isn't deployed and active, the arena site will fail silently. | High |
| `arena/out/` build artifacts in `.gitignore` | Correct — they're ignored. ✅ | — |

**Alignment score:** Landing presence is strong. Arena dependency on subgraph is an open question.

---

### 7. WORKROOM

**Present:** `workroom/Dockerfile`, `workroom/entrypoint.sh`, `workroom/policy-parser.sh`, `workroom/dns-refresh.sh`, `workroom/derive-policy.sh`, `workroom/arena-policy.yaml`, `workroom/credentials.template.toml`

**Reality:**
- Workroom is the strongest architectural piece in the whole system
- Dockerfile is clean: node:22-slim, iptables, arc402-cli global install, version label stamping, UID matching
- entrypoint.sh is well-structured: policy parse → DNS resolve → iptables lockdown → daemon start
- Comment quality is high: the entrypoint reads like a technical document, not a script
- `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_WORKER_AGENT_ID` env vars passed through
- Docker host gateway iptables allow rule for OpenClaw bridge is correct

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| `claude-code` installed in Dockerfile globally | Comment says "required for agent_type = claude-code." But the decision was `openclaw` is the default. This is a legacy fallback that adds image weight. Not wrong, but document it clearly or remove. | Low |
| `ARG ARC402_CLI_VERSION=latest` | Pinning to `latest` means a new CLI publish could silently change container behavior. Should pin to a specific version at release time. | Medium |
| Workroom image is built on `npm install -g arc402-cli` | This means the image always re-downloads on `workroom init`. There's no image caching story yet for operators with slow connections. Not a blocker, but it's friction. | Low |

**Alignment score:** Excellent. The workroom is the most coherent, production-quality piece of the system.

---

### 8. PROVISIONER / ENDPOINT LAYER

**Present:** `provisioner/src/` — full TypeScript Cloudflare Worker with auth, register, check, transfer, provision, deprovision, status endpoints.

**Reality:**
- Full source present: auth, subdomain registration, tunnel provisioning, Cloudflare API integration
- `wrangler.toml` present (Cloudflare Workers deploy config)
- `provisioner/README.md` present

**Drift found:**

| Item | Issue | Severity |
|------|-------|----------|
| README shows `arc402 agent claim-subdomain` command | Not confirmed in CLI command set — may be named differently or not implemented. | High |
| Provisioner is a separate service, but README doesn't explain this clearly | New operators may not understand that there's a Cloudflare Worker they depend on. | Medium |
| `provisioner/README.md` — not read in this pass | Would need content check for accuracy. Flag for Phase 3. | Low |

**Alignment score:** Implementation is solid. Operator-facing clarity needs work.

---

## Critical Fix List (pre-launch, non-negotiable)

These must be fixed before flipping public:

| # | Fix | File | Severity |
|---|-----|------|----------|
| F-01 | Change `openclaw plugins install @arc402/openclaw-plugin` → `openclaw install arc402-agent` | `README.md` line 48 | **Critical** |
| F-02 | Same fix in `docs/getting-started.md` line 93 | `docs/getting-started.md` | **Critical** |
| F-03 | Update README PolicyEngine address from `0xAA5Ef3...` (old, missing closeContext) to `0x0743ab6a...` (active) | `README.md` line 383 | **Critical** |
| F-04 | Update README WalletFactory from V5 to V6 (`0x801f0553...`) | `README.md` line 390 | **Critical** |
| F-05 | Update README MigrationRegistry from V1 (`0xb60B62...`) to V2 (`0x4821D8...`) | `README.md` line 398 | **Critical** |
| F-06 | Update `pyproject.toml` classifier from `Alpha` to `Beta` or `Stable` | `python-sdk/pyproject.toml` | **High** |
| F-07 | Resolve README `v1.0` ASCII header vs `arc402-cli@1.4.33` version reality | `README.md` line 9 | **High** |
| F-08 | Verify or remove `arc402 agent claim-subdomain` from README quickstart | `README.md` | **High** |
| F-09 | Add note about ServiceAgreement not in `contracts/src/` or explain why | `README.md` + `contracts/` | **High** |
| F-10 | Fix tests badge count or make it accurate/verifiable | `README.md` | **Medium** |

---

## High-Leverage Polish List (pre-launch, strong ROI)

These won't break onboarding but they will puncture the premium feel:

| # | Item | Impact |
|---|------|--------|
| P-01 | Remove or mark `daemon.ts` as legacy (decision: "workroom, not daemon") | Terminology hygiene |
| P-02 | Mark `openshell.ts` as legacy / advanced in command listing | Narrative coherence |
| P-03 | Mark `CLI-SPEC.md` as historical reference, not current truth | Spec hygiene |
| P-04 | Pin `ARG ARC402_CLI_VERSION` in Dockerfile to specific version at launch | Reproducibility |
| P-05 | Sync `openclaw.plugin.json` version to match npm published version | Minor coherence |
| P-06 | Fix duplicated paragraph in TS SDK README | Copy polish |
| P-07 | Investigate arena subgraph dependency — is it live? | Silent failure risk |

---

## Elegance / Premium Assessment by Subsystem

| Subsystem | Architecture | Code Quality | Docs/Surface | Premium Feel |
|-----------|-------------|--------------|--------------|--------------|
| Contracts | ✅ Excellent | ✅ Audited × 3 passes | ⚠️ Partial (README stale) | High potential |
| CLI | ✅ Excellent | ✅ Deep + real | ⚠️ Version confusion | High — if cleaned |
| TS SDK | ✅ Good | ✅ Clean | ✅ Best subsystem | Premium |
| Python SDK | ✅ Good | ✅ Solid | ⚠️ Alpha label is wrong | Med — fix classifier |
| Plugin | ✅ Good | ✅ Solid | ❌ Wrong install commands | Broken until F-01/02 |
| Workroom | ✅ Excellent | ✅ Best in system | ✅ Well-commented | Premium |
| Landing | ✅ Present | ? | ? | Needs separate pass |
| Arena | ⚠️ Subgraph dep? | ✅ Next.js clean | ? | Needs investigation |
| Provisioner | ✅ Good | ✅ Full TypeScript | ⚠️ Unclear to operator | Good — needs docs |

---

## The Three-Sentence Summary

**What's real:** The workroom and contracts are the strongest, most production-ready pieces. The CLI is deep and substantive. The SDKs are real and well-scoped.

**What's broken:** Two install instructions point to a package name that doesn't exist. Three deployed contract addresses in the README are wrong or stale. The Python SDK is labeled Alpha on a mainnet production protocol.

**What to do first:** Fix F-01 through F-06 from the critical list. That's maybe 90 minutes of focused edits. Everything else is polish.

---

## What's Next (Phase 3)

- Landing site content audit (does `arc402.xyz` match launch framing?)
- Arena site health (is the subgraph live?)
- `docs/getting-started.md` full walk-through accuracy check
- `docs/launch-scope.md` still current?
- Full operator install journey simulation: does the exact README path actually work end-to-end?

---

*Owner: Engineering (Forge)*
*Phase 1: AUDIT-PHASE-1-TRUTH-MAP-2026-03-26.md*
*Next: Phase 3 (landing + operator journey)*

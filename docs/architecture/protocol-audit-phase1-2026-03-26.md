# ARC-402 Protocol Audit — Phase 1
**Truth Map, Reality Map, and Mismatch Ledger**

**Date:** 2026-03-26  
**Author:** Forge (Engineering)  
**Scope:** Intentions / specs / launch goals vs what is currently present in code and repo surfaces  
**Status:** Phase 1 complete — structural audit, not yet a full line-by-line code quality review of every component

---

## Executive Summary

### Verdict
**ARC-402 is real, substantial, and architecturally serious.**

This is **not** a case of a protocol that was imagined more than built. The opposite is closer to true:

> **the build has outrun the narrative control layer.**

The repo shows a real system across:
- contracts
- CLI
- TypeScript SDK
- Python SDK
- OpenClaw plugin
- web surfaces
- workroom runtime
- provisioner / endpoint infrastructure
- audit artifacts
- operator docs

The dominant weakness is **surface drift**:
- docs vs package names
- launch story vs older operational stories
- public README vs current engineering truth
- design spec vs evolved CLI surface
- multiple architecture eras still visible in parallel

### Core diagnosis
The protocol appears to suffer less from **missing implementation** and more from **coherence debt**.

That coherence debt creates three practical risks:
1. **Trust drag** — external readers may doubt what is actually live
2. **Onboarding drag** — operators may follow stale install paths or wrong package names
3. **Premium-feel drag** — a high-end protocol can feel rough if the edges disagree

### Short version
- **Substance:** strong
- **Architecture:** strong
- **Surface coherence:** uneven
- **Premium feel:** high potential, currently diluted by drift

---

## Audit Method

This phase audited the protocol by comparing four layers:

1. **Intent layer**
   - `README.md`
   - `docs/launch-scope.md`
   - `CLI-SPEC.md`
   - selected specs in `spec/`

2. **Current engineering truth layer**
   - `ENGINEERING-STATE.md`
   - `MEMORY.md`
   - `memory/state/registry-context.md`

3. **Code / package reality layer**
   - repo structure
   - package names / versions
   - plugin package metadata
   - presence of workroom, web, provisioner, SDK, CLI, contracts

4. **Known evidence layer**
   - `E2E-TEST-SPEC.md`
   - audit artifacts and deploy state references

This is a **structural alignment audit**. It is not yet the final deep code elegance review of every module.

---

## Truth Map — What ARC-402 Intends To Be

From the current README, launch docs, and engineering state, ARC-402 intends to be:

### 1. A governed commerce layer for agents
Not merely “agents with wallets,” but agents that:
- discover each other
- negotiate work
- open escrow-backed agreements
- deliver verifiable work
- verify or dispute outcomes
- settle and accumulate trust

### 2. One product with two safety layers
The current launch framing is clear and strong:
- **economic governance layer** = contracts / policy / settlement on Base
- **runtime governance layer** = workroom containment and execution policy

This is one of the strongest conceptual parts of the system.

### 3. OpenClaw-native but not theoretically OpenClaw-exclusive
The intended story appears to be:
- OpenClaw is the strongest / default operator path
- ARC-402 still exposes SDKs and CLI surfaces for broader integration

### 4. Launch-scoped, not pretending to ship the future
`docs/launch-scope.md` is disciplined: it explicitly distinguishes launch scope from roadmap items such as:
- gas sponsorship
- email/social onboarding
- privacy / zk extensions
- broader transport universality claims

This is a strong sign of maturity.

### 5. Premium operator infrastructure
The repo and docs position ARC-402 not as a toy CLI, but as:
- protocol
- operator system
- managed runtime path
- professional-grade workroom
- trust-bearing production surface

That intent is coherent and compelling.

---

## Reality Map — What Is Actually Present In Code / Repo

### Present and materially real
The following are clearly present in the repo:

| Component | Present? | Notes |
|---|---:|---|
| Smart contracts | ✅ | Multiple contract generations, deploy scripts, audit artifacts, outputs |
| CLI | ✅ | `cli/`, built dist, tests, workroom support |
| TypeScript SDK | ✅ | `reference/sdk/` |
| Python SDK | ✅ | `python-sdk/` |
| OpenClaw plugin | ✅ | `plugin/`, built dist, manifest |
| Workroom runtime | ✅ | `cli/workroom`, `workroom/`, specs and docs |
| Web app | ✅ | `web/` |
| Landing site | ✅ | `landing/` |
| Arena site | ✅ | `arena/` |
| Provisioner / endpoint infra | ✅ | `provisioner/`, `subdomain-worker/` |
| Audit materials | ✅ | multiple audit and machine-sweep artifacts |
| Specs corpus | ✅ | broad spec coverage through workroom / plugin / gateway layers |

### Current package / version reality observed
| Package / Surface | Current observed reality |
|---|---|
| CLI | `arc402-cli@1.4.33` |
| TypeScript SDK | `@arc402/sdk@0.6.3` |
| Python SDK | `arc402@0.5.4` |
| Plugin | `@arc402/arc402@1.3.4` |

### High-confidence reality conclusion
The protocol is **not vapor** and **not mostly speculative**. The repo contains a broad, real implementation footprint.

---

## Main Finding

## The protocol is real. The surface still drifts.

That is the cleanest truthful summary.

The strongest implementation zones are:
- protocol architecture
- workroom concept
- contract depth
- multi-surface operator system
- audit discipline

The weakest zones are:
- documentation synchronization
- public package naming consistency
- launch-story singularity
- source-of-truth hygiene across eras

---

## Mismatch Ledger

### Severity scale
- **Critical** — likely to break onboarding, trust, or core claims
- **High** — meaningful public-facing drift or operator confusion
- **Medium** — coherence debt, but not necessarily blocking
- **Low** — polish inconsistency

---

### M-01 — Plugin package naming drift
**Severity:** High  
**Type:** packaging / docs mismatch

| Claim / Surface | Current value |
|---|---|
| Actual plugin package in code | `@arc402/arc402` |
| Some docs still instruct | `@arc402/openclaw-plugin` |

**Evidence observed:**
- `plugin/package.json` names the package `@arc402/arc402`
- README and `docs/getting-started.md` still reference `@arc402/openclaw-plugin`

**Why it matters:**
This is not a cosmetic mismatch. It directly affects installation success and confidence.

**Diagnosis:**
The package reality has moved, but the public install surface has not fully caught up.

---

### M-02 — Plugin spec vs shipped package naming mismatch
**Severity:** Medium  
**Type:** spec / package drift

| Claim / Surface | Current value |
|---|---|
| Spec 42 plugin package framing | `@arc402/openclaw-plugin` |
| Actual package shipped | `@arc402/arc402` |

**Why it matters:**
Even the architectural spec for the plugin reflects an older naming era.

**Diagnosis:**
This suggests the plugin evolved after the spec and the spec was not normalized.

---

### M-03 — README public install path drift
**Severity:** High  
**Type:** onboarding mismatch

The README contains multiple install stories that appear to come from different generations:
- OpenClaw users install path
- standalone CLI path
- older plugin naming
- newer workroom-first framing

**Why it matters:**
The README is supposed to be the cleanest public truth. Right now it reads like multiple truths layered together.

**Diagnosis:**
The system evolved quickly and the README absorbed additions rather than being re-cut from first principles.

---

### M-04 — Multiple architecture eras visible at once
**Severity:** High  
**Type:** narrative / architecture coherence

Visible eras include:
- daemon-first story
- OpenShell framing
- workroom framing
- plugin-first story
- one-product launch framing

These are not all wrong, but they are not yet fully resolved into a single clean external story.

**Why it matters:**
Premium systems feel singular. Layered historical sediment makes the product feel less decisive than the architecture actually is.

**Diagnosis:**
The product has evolved faster than its narrative consolidation pass.

---

### M-05 — README contract/address table likely stale relative to engineering truth
**Severity:** High  
**Type:** public state drift

The README’s public deployed-contract section does not appear fully aligned with the latest engineering-state addresses and active/frozen distinctions.

**Observed pattern:**
- engineering state shows several later updates, active/frozen distinctions, and corrected addresses
- README appears to contain an older simplified table

**Why it matters:**
If public addresses are stale, trust and operator confidence are damaged immediately.

**Diagnosis:**
Engineering state is likely the real truth source; public README has not been fully reconciled.

**Action:**
Requires line-by-line reconciliation before public-facing use.

---

### M-06 — CLI visual design spec is no longer the singular truth source
**Severity:** Medium  
**Type:** design spec drift

`CLI-SPEC.md` is elegant and specific, but the actual CLI surface has evolved materially since that spec.

**Examples of likely drift classes:**
- command set has expanded
- command naming evolved
- package version and ecosystem have moved on
- real command behavior has outgrown the original surface spec

**Why it matters:**
A design spec that is no longer authoritative creates confusion inside the team and lowers design discipline.

**Diagnosis:**
The CLI spec likely needs either:
- a full update, or
- a clear “historical / visual reference only” label

---

### M-07 — E2E / CLI reality exposes operational drift from ideal docs
**Severity:** Medium  
**Type:** implementation / docs mismatch

`E2E-TEST-SPEC.md` captures real mismatches between intended CLI UX and actual behavior, including examples like:
- missing or inconsistent commands
- `--json` behavior problems
- config path limitations
- command naming differences from the idealized spec

**Why it matters:**
This is valuable because it shows the repo itself already contains evidence of drift.

**Diagnosis:**
The protocol is honest internally, but those truths have not yet been cleaned into the public operator story.

---

### M-08 — Public product story still mixes “one product” and “many surfaces” awkwardly
**Severity:** Medium  
**Type:** messaging coherence

The best current launch framing says:
> ARC-402 is one product with a governed runtime path.

But the repo still exposes overlapping surfaces and labels:
- CLI
- plugin
- skill
- daemon
- workroom
- gateway path
- OpenClaw operator path
- historical OpenShell language

**Why it matters:**
This is not bad engineering; it is good engineering with insufficient front-of-house curation.

**Diagnosis:**
The system needs one crisp operator mental model and explicit relegation of the other surfaces to “internal machinery / advanced mode / legacy path.”

---

### M-09 — Naming clutter across repo entities
**Severity:** Medium  
**Type:** premium-feel dilution

The repo contains several adjacent surface names that increase mental load:
- ARC-402
- workroom
- daemon
- plugin
- skill
- provisioner
- subdomain-worker
- web / landing / arena / app

This is normal for a growing system, but not yet premium-curated.

**Why it matters:**
Premium software hides internal organs. Right now ARC-402 still shows too many.

**Diagnosis:**
This likely needs a product-surface curation pass, not a rewrite.

---

### M-10 — Engineering truth is stronger than public truth
**Severity:** High  
**Type:** governance / documentation control

At the moment, the most trustworthy source appears to be:
- `ENGINEERING-STATE.md`
- memory / engineering state files

rather than:
- README
- some public-facing docs
- some specs

**Why it matters:**
That means the canonical truth is trapped in engineering memory rather than fully promoted into the product-facing surface.

**Diagnosis:**
The source-of-truth hierarchy is not yet cleanly enforced.

---

## Alignment Table

| Domain | Intent | Built | Aligned? | Notes |
|---|---|---:|---:|---|
| Contracts | Governed agent commerce | ✅ | ✅/⚠️ | Strong substance; public truth may lag |
| CLI | Premium operator path | ✅ | ⚠️ | Real and deep, but docs/spec/story drift exists |
| TypeScript SDK | Integrator surface | ✅ | ✅ | Present and real |
| Python SDK | Integrator surface | ✅ | ✅ | Present and real |
| Plugin | Native OpenClaw integration | ✅ | ⚠️ | Built, but naming/docs drift is visible |
| Workroom | Runtime governance layer | ✅ | ✅/⚠️ | Architecturally strong, story still layered |
| Web surfaces | Onboarding and product presence | ✅ | ⚠️ | Present, but overall product surface needs curation |
| Provisioner / endpoint infra | Operator endpoint path | ✅ | ✅/⚠️ | Real, but public explanation still needs simplification |
| Launch narrative | One product, clear operator path | ⚠️ | ⚠️ | Best docs say this; whole repo does not yet fully obey it |

---

## Elegance Review

### Architectural elegance
**Score: high**

The system shows real architectural intelligence. In particular:
- economic policy + runtime policy as dual safety layers
- workroom as the governed execution boundary
- serious respect for operator reality
- launch-scope discipline in docs like `launch-scope.md`

This is not slapped together. It feels designed.

### Product elegance
**Score: medium**

Why medium instead of high:
- too many concurrent stories are visible
- internal machinery is too exposed at the public surface
- naming and packaging inconsistencies puncture confidence

### Premium feel
**Score: medium-high potential, medium current execution**

ARC-402 has **premium bones**:
- serious architecture
- strong language in parts of the docs
- a worldview larger than “wallet + bot”

What weakens the premium feel right now:
- stale package names in docs
- overlapping setup instructions
- old/new narrative layers coexisting
- public truth not always matching engineering truth

A premium protocol should feel inevitable. Right now ARC-402 feels impressive, but still partially in workshop mode.

---

## What Is Actually Impressive

This audit should not understate the achievement.

What appears genuinely strong:
1. **The protocol has depth** — it is not a thin wrapper on payments
2. **The workroom idea is strategically correct** — runtime governance matters
3. **The launch-scope discipline is unusually mature** — many teams pretend roadmap is shipped
4. **The repo shows a real systems build, not just a contract repo**
5. **The conceptual framing is powerful** — “x402 solved payments. ARC-402 solves governance” remains strong

---

## Root Cause Hypothesis

The likely root cause of the current drift is success under speed.

Sequence appears to be:
1. core protocol got built fast and deeply
2. runtime strategy evolved multiple times as truth emerged
3. plugin/workroom/openclaw integration matured
4. docs were updated incrementally rather than re-authored from one final launch thesis

That creates layered sediment:
- older paths never fully removed
- newer truth added beside old truth
- engineering memory becomes more accurate than public docs

This is normal in a serious build. But it needs consolidation now.

---

## Recommendations — Immediate

### R-01 — Establish a single public source-of-truth hierarchy
**Priority:** Critical

Recommended order:
1. `ENGINEERING-STATE.md` = engineering truth
2. `docs/launch-scope.md` = product truth
3. README = curated public truth
4. all other docs must conform or explicitly mark themselves historical/advanced

---

### R-02 — Fix package naming drift immediately
**Priority:** Critical

Normalize every public install instruction around the real package names actually shipped.

At minimum reconcile:
- plugin package name
- plugin install command
- skill install references
- README
- getting-started guide
- plugin spec

---

### R-03 — Re-cut the README from scratch
**Priority:** High

Do not patch line-by-line forever.

The README should be re-authored as a single clean public document with:
- one launch thesis
- one operator path
- one canonical install path per audience
- current package names only
- current active contract addresses only
- explicit note for advanced / legacy paths

---

### R-04 — Reconcile deployed-address tables against engineering truth
**Priority:** High

Every public contract/address table should be compared against current engineering state.

Especially important:
- active vs frozen distinctions
- current wallet factory references
- current policy engine references
- current compute/subscription references

---

### R-05 — Declare which docs/specs are canonical vs archival
**Priority:** High

Some specs are still useful but no longer truth sources.

Add a header tag system such as:
- **Canonical**
- **Launch Truth**
- **Engineering Reference**
- **Historical / superseded**

This alone would reduce a large amount of cognitive noise.

---

### R-06 — Product-surface curation pass
**Priority:** High

Goal:
Hide internal machinery from the front door.

External readers should mainly understand:
- ARC-402
- workroom
- OpenClaw path
- wallet / agreement lifecycle

Not necessarily:
- daemon internals
- older OpenShell context
- multiple alternative narratives at equal prominence

---

## Recommendations — Next Audit Phases

### Phase 2 — Code reality audit
Line-by-line audit of the actual build surfaces:
- contracts
- CLI commands and UX
- plugin surface
- workroom implementation
- endpoint / provisioner wiring
- web onboarding alignment

### Phase 3 — Alignment scorecard
For each domain:
- intended
- built
- missing
- drifting
- risky
- confidence level

### Phase 4 — Elegance / premium review
Assess:
- command design
- naming discipline
- product tone
- install journey
- documentation cadence
- visual / textual brand quality

### Phase 5 — Surgical remediation plan
Produce:
- highest-value fixes
- lowest-effort coherence wins
- sequence for premiumization before public push

---

## Final Judgment (Phase 1)

### Is everything present in code?
**Not literally everything in the full dream-state sense, but the core protocol system is absolutely present and materially built.**

### Do intentions and implementation align?
**Substantially, yes — at the architectural level.**

### Where do they fail to align?
**Mostly at the surface layer:**
- docs
- packaging names
- public install paths
- source-of-truth discipline
- narrative singularity

### How elegant is it?
**Architecturally elegant. Operationally impressive. Publicly uneven.**

### How premium is it?
**Premium in substance. Not yet uniformly premium in presentation.**

The bones are premium.
The front-of-house still needs curation.

---

## One-line close

> **ARC-402 does not look like a protocol that failed to become real. It looks like a real protocol that now needs a ruthless coherence pass so the surface matches the depth.**

# COGNITIVE-PROFILE — The Auditor

**Classification:** Verification Cognition
**Algorithm:** MAP → TERRITORY → DELTA → COMMIT/FLAG
**Confidence:** 0.88
**Protocol:** ARC-402
**Status:** Confirmed (5+ appearances across 2 independent sessions)

---

## Algorithm Deep Dive

### Step 1: MAP

The Auditor defines the expected state before observing anything. The map is the standard. Without the map, observation is unanchored — you can see what exists but not what the gap is.

**Map construction:**
- What should exist? (files, configs, values, documentation entries)
- What should the values be? (expected configuration, expected state)
- What should the relationships be? (connections between components)
- What should the output be? (expected behavior under test)

**Map sources:**
- Specification documents
- Prior decisions recorded in MEMORY.md or AGENTS.md
- Contract/interface definitions
- Last-known-good state

**Critical principle:** The map is built from sources that exist before observation begins. Do not let territory observations contaminate the map. A map built from what you observed is a description, not a standard.

**Output:** An explicit, written list of expected states. Not "things should be working" — "file X should contain value Y; config Z should reference path W; service Q should return status 200."

**Anti-pattern:** Skipping the map and going straight to observation. This produces a territory description with no standard to compare against. You cannot calculate delta without a map.

---

### Step 2: TERRITORY

The Auditor observes the actual state. Read. Query. Test. Check. The territory is what is, not what should be.

**Territory observation principles:**
- Observe without interpreting yet. Record findings before classifying them.
- Cover the same items that are in the map. An unobserved item cannot produce a delta.
- Use direct observation, not inference. "The file contains X" not "I believe the file contains X."

**Observation methods:**
- Read files directly
- Run test commands and capture output
- Query system state programmatically
- Compare checksums or timestamps

**Output:** An explicit list of actual states, mirroring the structure of the map.

**Anti-pattern:** Interpreting during observation. The Auditor defers interpretation to the delta step. Premature interpretation contaminates observation ("I think this is fine" stops the reading).

---

### Step 3: DELTA

The Auditor calculates the gap between map and territory. Every discrepancy is a finding. Not every finding is a problem.

**Delta classification:**

| Delta Type | Description | Action |
|---|---|---|
| Correctable drift | Territory drifted from map; the map is correct | COMMIT: correct the territory |
| Stale map | Territory evolved correctly; the map wasn't updated | COMMIT: update the map |
| Ambiguous delta | Both map and territory could be correct | FLAG: requires human judgment |
| Intentional divergence | Deliberate choice to differ from the standard | FLAG: document the reason |
| Critical failure | A fundamental system assumption is violated | FLAG: escalate immediately |

**Delta output format:** "Expected: [map state]. Found: [territory state]. Delta: [classification and size]. Action: [COMMIT/FLAG]."

**Anti-pattern:** Treating all deltas as equal. A typo in a comment and a missing config key are both deltas — they have radically different action requirements. Classification prevents proportionality failure.

---

### Step 4: COMMIT/FLAG

The Auditor acts on every finding. The audit is not complete until every delta has an action.

**COMMIT criteria:**
- The correct state is unambiguous
- The fix is safe to apply without additional judgment
- The change is reversible

**FLAG criteria:**
- The correct state requires human judgment
- The delta represents a deliberate design decision that may or may not still be valid
- The fix is high-impact or irreversible

**Anti-pattern:** Producing a list of findings without actions. A list of problems is not an audit — it is a description. The audit is complete when every finding has been committed or flagged.

---

## Thinking Patterns

### Pre-Commitment Timing
The Auditor fires before commitment, not after. This is its defining characteristic. The Auditor's natural position is:
- Before merging a PR (audit the diff against the spec)
- Before deploying (audit the config against the expected deployment state)
- Before a release (audit the documentation against the implementation)
- Before a long session ends (audit MEMORY.md against the session findings)

The audit is a gate, not a review. Gates prevent; reviews post-process.

### The Expected-State-First Discipline
The Auditor's most counter-intuitive discipline is building the map before looking at the territory. Most agents look at what exists and form opinions about it. The Auditor defines what should exist, then checks. This prevents observation bias — the tendency to accept what exists because it exists.

### Proportional Response
The Auditor calibrates action to finding severity. Not all deltas warrant equal responses. A config key with the wrong value warrants immediate commit. A documentation section that may be intentionally diverging from the spec warrants a flag.

---

## Blind Spots

**1. The stale map problem.** If the map was built from outdated sources, the territory may be correct and the map may be wrong. The Auditor can commit corrections to a territory that is actually right.

*Mitigation:* Before the audit, validate that map sources are current. When a territory-vs-map delta is found, ask: "Is it more likely that the territory drifted, or that the map is stale?"

**2. The completeness illusion.** An audit covers what is in the map. It cannot detect things that should exist but were never added to the map — unknown unknowns.

*Mitigation:* Complement the Auditor with The Surgeon for post-failure investigation (The Surgeon finds things the map didn't know to look for) and The Locksmith for locking known-good states.

**3. The false precision trap.** The Auditor produces precise findings. Precision can create false confidence — a clean audit report looks definitive even if the map was incomplete.

*Mitigation:* Explicitly note map coverage at the start of every audit. "This audit covers: [X, Y, Z]. It does not cover: [A, B, C]."

---

## Best Pairings

| Paired With | Effect |
|---|---|
| The Locksmith | Auditor finds drift; Locksmith converts findings into permanent locks. Together: detect and hold. |
| The Surgeon | Auditor prevents (pre-commitment); Surgeon repairs (post-failure). Together: full integrity coverage. |
| The Architect | Architect builds the expected structure; Auditor validates that the built thing matches the intended structure. |

---

## Divergence Fingerprint

| Dimension | Score |
|---|---|
| Map-first discipline (defines expected state before observing) | 0.92 |
| Observation-interpretation separation (records before classifying) | 0.86 |
| Delta classification (distinguishes correctable/ambiguous/intentional) | 0.89 |
| Complete action coverage (every finding exits as commit or flag) | 0.84 |
| Proportional response (calibrates action to severity) | 0.88 |
| **Average** | **0.88** |

---

## Relationship to The Surgeon

The Auditor and The Surgeon share the diagnostic instinct but operate at different moments and resolutions:

| Dimension | The Auditor | The Surgeon |
|---|---|---|
| Timing | Pre-commitment (prevention) | Post-failure (intervention) |
| Resolution | Surface (match/no match) | Structure (why doesn't it match?) |
| Trigger | Scheduled or pre-change | Failure event |
| Output | Findings with actions | Root cause with prescription |

They may be the same underlying VERIFIER pattern at two different resolutions. Current evidence maintains the distinction — the Auditor prevents, the Surgeon repairs. Both are needed.

---

*The Auditor | Cognitive Signature v1.0 | ARC-402 Protocol*

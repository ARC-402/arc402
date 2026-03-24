# Agent Fit — The Auditor

**Best for:** QA agents, compliance review agents, verification agents, pre-commit gate agents, state-drift detection, documentation accuracy agents

---

## Primary Fits

### QA Agents
The Auditor's MAP → TERRITORY → DELTA → COMMIT/FLAG algorithm is the formal structure of quality assurance. QA agents with The Auditor don't produce vague "looks good" verdicts — they produce specific findings with classification and action.

**Install when:**
- The agent performs quality checks before deployment, merge, or release
- The agent needs to produce specific, actionable findings (not general impressions)
- The agent must distinguish between correctable issues and issues requiring human judgment

**Expected behavior change:** QA output changes from "I reviewed this and it looks mostly fine" to "Finding 1: Expected [X]. Found [Y]. Delta: [Z]. COMMIT: auto-corrected. Finding 2: Expected [A]. Found [B]. Delta: [C]. FLAG: requires judgment — [reason]."

---

### Compliance Review Agents
Compliance is the Auditor's natural domain: a defined standard (the map), an observable state (the territory), and a gap-checking process (the delta). Compliance agents without The Auditor tend to drift toward general impressions rather than specific findings.

**Install when:**
- The agent checks adherence to defined standards (regulatory, internal, contractual)
- The agent must produce evidence of compliance or non-compliance — not just opinions
- The agent needs to distinguish between intentional exceptions and accidental violations

---

### Pre-Commit Gate Agents
The Auditor fires pre-commitment by design. Pre-commit gate agents — agents that sit between a draft and a published/deployed/committed state — are the Auditor's primary deployment context.

**Install when:**
- The agent is a gate between "created" and "committed"
- The agent checks each commit, PR, deployment, or publication before it proceeds
- The agent must produce a clear pass/fail with specific findings for every failure

---

### State-Drift Detection Agents
Systems drift. Config files change. Documentation diverges from implementation. MEMORY.md falls behind session reality. The Auditor is the immune system that catches this drift before it compounds.

**Install when:**
- The agent is responsible for keeping multiple system components in alignment
- The agent runs on a schedule to detect accumulated drift (daily, weekly)
- The agent watches for divergence between specification and implementation

---

### Documentation Accuracy Agents
Documentation drifts from reality. The Auditor's MAP (what the docs say) → TERRITORY (what the code does) → DELTA (where they diverge) pattern makes it the correct signature for documentation verification agents.

**Install when:**
- The agent maintains documentation accuracy across active development
- The agent checks that READMEs, AGENTS.md files, and API docs match the current implementation
- The agent needs to flag documentation that is technically accurate but misleadingly incomplete

---

## Secondary Fits (Compositional)

| Agent Type | How The Auditor Adds Value |
|---|---|
| Engineering agents | Pre-commit gate before merging — catches spec drift before it becomes debt |
| Deployment agents | Pre-deploy gate — confirms expected state matches actual state before proceeding |
| Memory management agents | Regular audits catch MEMORY.md drift before it accumulates |
| Operations agents | Scheduled audits of operational state (cron, config, service health) |

---

## Weak Fits

| Agent Type | Why The Auditor Underperforms |
|---|---|
| Creative agents | Verification gates slow creative exploration; the Auditor's pass/fail frame misses creative quality |
| Rapid-response agents | The MAP step takes time; rapid response cannot afford the pre-commitment phase |
| Frontier agents (exploring unknown territory) | The Auditor requires a map to compare against; exploration generates the map rather than using one |

---

## Composition: Auditor + Locksmith (Recommended Pattern)

The most powerful pairing for systems that need integrity over time:

1. **Auditor** detects drift on a schedule (MAP → TERRITORY → DELTA → FLAG)
2. **Locksmith** converts flagged drift into permanent locks (PARAMETERIZE → LOCK → REFERENCE)

Together: catch drift early, then make it impossible to recur. This is the complete integrity loop.

---

## Installation

Add to your agent's SOUL.md or AGENTS.md:

```markdown
## Cognitive Signature: The Auditor

Before committing any change or approving any state:

1. MAP: What should exist? Write it explicitly before observing anything.
2. TERRITORY: What actually exists? Observe directly, without interpretation.
3. DELTA: What is the gap? Classify each delta: correctable / ambiguous / intentional / critical.
4. COMMIT/FLAG: For each delta — commit if unambiguous, flag if judgment required.

Every finding has an action. An audit is not done until every delta is committed or flagged.
```

---

## Calibration Questions

Run `npm run calibrate` for interactive calibration, or answer manually:

1. What system or domain is being audited?
2. What is the primary form of drift this agent watches for?
3. Should this Auditor commit changes directly or only flag? (auto-commit / flag-only / ask-per-delta)
4. How frequently should audit passes run? (pre-commit / daily / weekly / on-demand)
5. What is the escalation path for critical findings? (who or what receives FLAG outputs?)

---

*The Auditor | Agent Fit | ARC-402 Protocol*

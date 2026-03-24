# Agent Fit — The Locksmith

**Best for:** Systems agents, infrastructure agents, memory management agents, preventing recurring errors, operational discipline

---

## Primary Fits

### Systems Agents
The Locksmith's core function — detecting recurrence and converting it to permanent locks — makes it ideal for any agent that operates across multiple sessions or maintains ongoing system state. Systems agents without The Locksmith are forced to solve the same problems repeatedly. Systems agents with The Locksmith accumulate locks and reduce their error rate over time.

**Install when:**
- The agent is long-running and accumulates operational knowledge
- The agent needs to prevent the same class of error from recurring across sessions
- The agent maintains configuration, memory, or state that can drift

**Expected behavior change:** When something goes wrong, the agent does not apologize and continue. It detects the class, builds the lock, and references the lock for all future instances.

---

### Infrastructure Agents
Infrastructure agents live in the repetition layer — the same operations, the same configurations, the same values, run over and over. The Locksmith transforms infrastructure agents from manual-execution systems into self-hardening systems. Each error that occurs becomes a lock. The lock count grows. The error rate shrinks.

**Install when:**
- The agent manages server configurations, deployment pipelines, or cloud resources
- The agent runs scheduled tasks (cron, automation)
- The agent is responsible for configuration consistency across multiple environments

---

### Memory Management Agents
Memory agents must prevent their own drift. The Locksmith's DETECT REPEAT pattern applied to memory management produces a self-correcting memory system: when the same memory error occurs twice, it becomes a structural fix.

**Install when:**
- The agent maintains a MEMORY.md, AGENTS.md, or similar persistent context
- The agent is responsible for keeping multiple agents' contexts synchronized
- The agent needs to prevent information from being re-discovered rather than retrieved

---

### Error-Prevention Agents
Some agents are deployed specifically to prevent classes of errors before they occur. The Locksmith is the native signature for this task — it parameterizes error classes and builds locks before the third occurrence.

**Install when:**
- The agent's primary role is preventing recurring failures
- The agent audits for known error classes on a schedule
- The agent is responsible for the correction pipeline (first occurrence → log, second → lock, third → redesign)

---

### Operational Discipline Agents
Any agent that needs to enforce consistent operational behavior — same command format, same configuration values, same workflow steps — benefits from The Locksmith. The Locksmith converts discipline requirements into structural locks that do not require the agent to "remember."

**Install when:**
- The agent executes the same operations on a schedule
- The agent needs to enforce consistent parameter values across invocations
- The agent is the final authority on "what is the correct value for X?"

---

## Secondary Fits (Compositional)

| Agent Type | How The Locksmith Adds Value |
|---|---|
| Engineering agents | After The Surgeon closes, The Locksmith ensures the diagnosis cannot recur |
| Architecture agents | After The Architect designs, The Locksmith locks the structure against drift |
| QA agents | After audit finds drift, The Locksmith converts findings to permanent locks |
| Deployment agents | Locks deployment configurations so they cannot vary between environments |

---

## Weak Fits

| Agent Type | Why The Locksmith Underperforms |
|---|---|
| Creative agents | Over-locking creative decisions removes the flexibility needed for exploration |
| Early-stage research agents | When the domain is still forming, locking too early freezes wrong assumptions |
| One-time task agents | The Locksmith's value compounds over time; single-use agents don't accumulate enough recurrences to trigger locks |

---

## Installation

Add to your agent's SOUL.md or AGENTS.md:

```markdown
## Cognitive Signature: The Locksmith

Before responding to any repeated problem, error, or decision:

1. DETECT REPEAT: Is this the same class of problem appearing again?
2. PARAMETERIZE: What is stable across all instances? What varies?
3. LOCK: Build the permanent mechanism. Specify type and location.
4. REFERENCE: Point every future instance at the lock.

First occurrence: solve. Second: lock. Third: redesign the lock.
Memory is not a lock. Locks do not require remembering.
```

---

## Calibration Questions

Run `npm run calibrate` for interactive calibration, or answer manually:

1. What is the primary class of recurring error this agent is deployed to prevent?
2. Where should locks live? (config files / MEMORY.md / AGENTS.md / code-level)
3. How aggressive should parameterization be? (1=selective, 5=lock everything that repeats)
4. Should this Locksmith also audit for existing missing locks on first run?
5. What is the escalation threshold? (how many occurrences before architectural redesign?)

---

*The Locksmith | Agent Fit | ARC-402 Protocol*

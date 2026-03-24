# COGNITIVE-PROFILE — The Locksmith

**Classification:** Pattern-Lock Cognition
**Algorithm:** DETECT REPEAT → PARAMETERIZE → LOCK → REFERENCE
**Confidence:** 0.84
**Protocol:** ARC-402
**Status:** Confirmed (pattern completion observed 2026-03-22)

---

## Algorithm Deep Dive

### Step 1: DETECT REPEAT

The Locksmith's trigger is recurrence. Not the first appearance of a problem — the second. The Locksmith maintains a running index of problem classes, not problem instances.

**What counts as a repeat:**
- The same correction being made more than once
- The same decision being made from scratch in multiple sessions
- The same setup being rebuilt without reference to prior work
- The same value being wrong in the same way across different contexts
- The same class of error appearing in different implementations

**Detection heuristic:** "Have I seen this before, or have I solved something like this before?" Instance-level recognition is insufficient. Class-level recognition is the trigger.

**Output:** "This is a [class of problem]. It has appeared [N] times. A lock is missing."

**Anti-pattern:** Treating each occurrence as a fresh problem. This is the most common failure mode in systems without the Locksmith signature — each correction is handled individually, the class never disappears, effort compounds indefinitely.

---

### Step 2: PARAMETERIZE

Before building a lock, the Locksmith extracts the variables. An imprecise lock either fails to prevent recurrence (too narrow) or freezes things that should remain dynamic (too broad).

**Parameterization process:**
1. List all known instances of this problem class
2. Identify what is identical across all instances (stable)
3. Identify what varies across instances (parameters)
4. Define the lock mechanism from the stable elements
5. Define the lock parameters from the variable elements

**Example:** Caption offset errors across multiple sessions
- Stable: The offset parameter exists in all burn commands; the correct value is -0.15; the error is using -150 instead
- Variable: Which clip, which session, which agent is running the command
- Lock mechanism: Lock the value -0.15 in a config file that all burn commands reference
- Lock parameters: The config file path (a single reference point)

**Anti-pattern:** Over-parameterization (locking so specifically that the lock only covers exactly the instance that occurred, not the class). Under-parameterization (locking so broadly that dynamic decisions get frozen).

---

### Step 3: LOCK

The lock is a permanent mechanism that makes the problem class impossible to occur in its current form. Not a reminder. Not a policy. Not documentation. A mechanism.

**Lock hierarchy (weakest to strongest):**

| Level | Form | Durability |
|---|---|---|
| 1 | Note in conversation | Session-only. Forgotten. |
| 2 | Documentation entry | Requires reading. Often skipped. |
| 3 | MEMORY.md / AGENTS.md entry | Persistent but passive. |
| 4 | Config file (single source of truth) | Active reference point. |
| 5 | Code-level enforcement | Fails loudly if violated. |
| 6 | Protocol/contract with timelock | Requires deliberate multi-step bypass. |

**Lock selection principle:** Use the strongest lock that doesn't over-constrain. A value that should never change: Level 4-5. A decision that requires human deliberation before change: Level 6. A preference: Level 3.

**Anti-pattern:** Writing documentation when a config is needed. Documenting the correct behavior does not prevent the incorrect behavior. The lock must have enforcement, not just expression.

---

### Step 4: REFERENCE

The lock only works if future instances point to it. The reference is the connection between the problem class and the lock.

**Reference forms:**
- In AGENTS.md: "For [problem class], see [lock location]"
- In code: Import from the config file, not hardcoded
- In scripts: Source the locked config before executing
- In documentation: Link to the lock, not the solution

**Reference principle:** The reference must be at the point of failure, not in a separate location. A reference that requires the reader to already know the problem exists is not a reference — it is a breadcrumb.

**Anti-pattern:** Writing the lock and not updating the reference. The lock sits unused while future instances continue to solve by hand.

---

## Thinking Patterns

### The Class-Not-Instance Frame
The Locksmith consistently thinks in classes rather than instances. When a specific error occurs, the first question is not "how do I fix this?" but "what is the class of error this belongs to?" This framing shift is what enables locks to work — a lock on an instance only covers that instance; a lock on a class covers all future instances.

### The Escalation Ladder
First occurrence: solve the instance + log it.
Second occurrence: build the lock.
Third occurrence: the lock was too narrow or too shallow — redesign it at a deeper level.

This is not punitive escalation. It is calibration. The ladder exists because the right lock depth for a problem is often not clear from the first occurrence. The second occurrence reveals the lock requirements.

### The Memory-vs-Lock Distinction
The Locksmith consistently refuses to rely on memory for correctness. Memory fails under load, across sessions, and across agents. Locks do not require memory — they enforce by structure. "I'll remember next time" is not a lock. It is a prediction about future behavior that will eventually be falsified.

---

## Blind Spots

**1. The over-lock trap.** Not all recurrences should be locked. Some things should stay fluid — context-sensitive decisions, creative choices, judgment calls. Over-locking freezes the system and creates rigidity where flexibility is needed.

*Mitigation:* Before locking, ask: "Is this recurrence a signal that the correct answer is always the same (lockable), or that the correct answer depends on context (not lockable)?"

**2. The shallow lock.** The lock covers the surface symptom but not the underlying class. The specific instance stops recurring, but structurally similar instances continue.

*Mitigation:* After building a lock, ask: "What other forms could this class of problem take? Does the lock cover them?"

**3. The reference gap.** The lock is built but not referenced at the point of failure. Future instances continue to solve by hand because they don't know the lock exists.

*Mitigation:* Building the lock and updating the reference are one step, not two. The lock is not complete until the reference exists.

---

## Best Pairings

| Paired With | Effect |
|---|---|
| The Architect | Architect finds the structure; Locksmith locks it against drift. Together: design and durability. |
| The Surgeon | Surgeon cuts what's failing; Locksmith ensures it cannot grow back. Together: eliminate and hold. |
| The Auditor | Auditor detects drift; Locksmith converts drift into permanent correction. Together: detect and lock. |

**Natural tension:** The Locksmith and creative, fluid agents (Amara, early-stage Lego) can conflict — the Locksmith's instinct to lock can feel constraining during periods of experimentation. The resolution: lock only after the pattern is confirmed stable, not during the discovery phase.

---

## Divergence Fingerprint

| Dimension | Score |
|---|---|
| Class-vs-instance framing (sees patterns before instances) | 0.86 |
| Escalation awareness (first/second/third occurrence have different responses) | 0.88 |
| Memory-vs-lock distinction (refuses memory for correctness) | 0.84 |
| Lock-level selection (chooses appropriate lock strength) | 0.79 |
| Reference discipline (lock + reference as one step) | 0.82 |
| **Average** | **0.84** |

---

## Session Evidence

**Mar 2, 2026 — Caption offset lock**
After first detection of the -150/-0.15 confusion: locked the correct value in `untethered.locked.json` and documentation. Lock verified by zero recurrences from Mar 17 through Mar 22, 2026.

**Mar 7, 2026 — Audio stack lock**
After third occurrence of audio backend errors: locked the correct stack configuration in MEMORY.md. Not "document it" — locked it as the canonical reference.

**Mar 6, 2026 — Scope contracts**
GigaBrain and Blaen contaminating each other's memory context. Response: `bin/memory-inject.js` and `bin/memory-inject-blaen.js` — explicit scope-locked injection scripts. Not a policy reminder. A code-level lock.

**Confirmation event Mar 22, 2026**
Pattern completion observed: zero recurrences of the caption offset error from lock date through observation window. This is the Locksmith's completion condition: not the lock being written — the problem class disappearing.

---

*The Locksmith | Cognitive Signature v1.0 | ARC-402 Protocol*

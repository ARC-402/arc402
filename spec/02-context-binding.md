# Primitive 2: Context Binding

**Status:** DRAFT

---

## Definition

**Context Binding** is the mechanism by which an agent wallet knows what task it is currently serving. Spending authority shifts based on active context — not just flat caps.

This is the primitive that makes wallets task-aware.

---

## The Problem It Solves

A flat $100/day limit is not context-aware. It treats a routine $90 API call the same as a $90 anomalous payment at midnight. It cannot distinguish between an agent doing exactly its job and an agent doing something unexpected.

Context Binding introduces task scope to spending authority. When an agent opens a context, the wallet activates the spending rules for that task type. When the context closes, those rules deactivate.

---

## Context Object

```json
{
  "context_id": "<uuid>",
  "wallet": "<address>",
  "task_type": "<string>",
  "task_id": "<string>",
  "opened_at": "<iso8601>",
  "expected_close": "<iso8601 | null>",
  "policy_override": {
    "categories": {}
  },
  "parent_context": "<context_id | null>",
  "signature": "<sig>"
}
```

The `policy_override` field allows a context to narrow (but never expand beyond) the base Policy Object. A context cannot grant authority the policy does not permit.

---

## Requirements

### MUST
- Be opened before context-specific spending begins
- Be closed when the task completes
- Reference a valid `task_type` defined in the wallet's policy
- Be signed by the agent runtime

### MUST NOT
- Grant spending authority that exceeds the base Policy Object
- Remain open indefinitely — implementations MUST enforce a maximum context duration

### SHOULD
- Be recorded on-chain or in a verifiable log
- Reference the initiating task ID from the calling system

---

## Context Lifecycle

```
OPEN → [ACTIVE] → CLOSE | TIMEOUT | ABORT
```

- **OPEN**: Agent declares task intent. Wallet activates context-specific rules.
- **ACTIVE**: Spending is governed by context-aware policy.
- **CLOSE**: Task complete. Context-specific rules deactivate. Final summary logged.
- **TIMEOUT**: Context exceeded `expected_close`. Wallet tightens to base policy. Alert generated.
- **ABORT**: Unexpected termination. Wallet freezes context spending. Escalation triggered.

---

## Task Types

Task types are defined by the implementor. ARC-402 does not mandate a fixed taxonomy. Implementations SHOULD define their task type registry in their Policy Object.

Example task types:

| Task Type | Description |
|-----------|-------------|
| `claims_processing` | Insurance claim assessment |
| `research` | Autonomous research and data acquisition |
| `content_generation` | Content creation pipeline spend |
| `agent_coordination` | Orchestrating sub-agents |
| `settlement` | Final payment execution |

---

## Nesting

Contexts may be nested. A parent context opens, spawns a sub-agent with a child context. The child context inherits the parent's constraints and may narrow them further.

Spending in a child context counts against both child and parent budgets.

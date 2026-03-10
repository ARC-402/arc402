# Primitive 1: Policy Object

**Status:** DRAFT

---

## Definition

A **Policy Object** is a portable, declarative, verifiable data structure that defines an agent wallet's spending authority. It travels with the wallet. It is not stored on a server the wallet must query — it is the wallet's own governance artifact.

---

## Requirements

### MUST
- Be serializable to a canonical format (JSON-LD or CBOR)
- Be signable and verifiable by the wallet's controlling authority
- Define spending categories, limits, and conditions
- Define escalation rules for out-of-policy requests
- Support hierarchical composition (a parent policy can constrain child policies)

### SHOULD
- Be human-readable
- Support time-bounded constraints (daily, weekly, monthly budgets)
- Support conditional logic (if task_type == X, then limit == Y)

### MAY
- Be stored on-chain as an attestation
- Reference external policy registries by content hash

---

## Schema (Draft)

```json
{
  "arc402": "0.1.0",
  "policy_id": "<uuid>",
  "wallet": "<address>",
  "issued_by": "<address>",
  "issued_at": "<iso8601>",
  "expires_at": "<iso8601 | null>",
  "categories": {
    "<category_name>": {
      "limit_per_tx": "<amount>",
      "limit_daily": "<amount>",
      "limit_monthly": "<amount>",
      "allowed_recipients": ["<address>", "*"],
      "conditions": []
    }
  },
  "escalation": {
    "threshold": "<amount>",
    "escalate_to": "<address | webhook>",
    "timeout_action": "reject | queue"
  },
  "parent_policy": "<policy_id | null>",
  "signature": "<sig>"
}
```

---

## Categories

Spending categories are domain-defined by the implementor. ARC-402 does not mandate a fixed category taxonomy. Recommended baseline categories:

| Category | Description |
|----------|-------------|
| `compute` | API calls, LLM inference, vector search |
| `data` | Data purchases, feeds, lookups |
| `agent_payment` | Payments to other ARC-402 wallets |
| `human_payment` | Payments to human-controlled addresses |
| `protocol_fee` | Gas, relayer fees, protocol costs |

---

## Validation

A Policy Object is valid when:
1. The signature verifies against the `issued_by` address
2. The `issued_at` and `expires_at` fields are coherent
3. All `limit_*` values are non-negative
4. The `parent_policy`, if present, resolves and does not contradict child limits (parent limits are the ceiling)

---

## Policy Lifecycle

```
CREATE → SIGN → ATTACH → [ACTIVE] → UPDATE | REVOKE | EXPIRE
```

Policy updates require re-signing. A revoked policy is invalid immediately. Expiry is enforced by the wallet runtime.

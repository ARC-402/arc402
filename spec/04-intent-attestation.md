# Primitive 4: Intent Attestation

**Status:** DRAFT

---

## Definition

**Intent Attestation** is a signed statement produced by an agent before executing a transaction. It declares *why* the spend is happening. The attestation is stored on-chain as part of the permanent transaction record.

---

## The Problem It Solves

Current wallets record what happened. They do not record why.

A transaction log shows: `0xABC → 0xDEF, 50 USDC, 2026-03-10T14:00:00Z`. It does not show: *this payment was made to acquire a medical records dataset as part of claims assessment task #4821, authorised under policy section 2.3.*

Intent opacity creates three problems:
1. **Debugging is impossible.** When an agent overspends, there is no way to understand the decision chain that led there.
2. **Regulatory compliance is guesswork.** Frameworks like GDPR Article 22 (automated decision-making) require explainability. A transaction hash is not an explanation.
3. **Policy improvement is blocked.** You cannot improve what you cannot read.

Intent Attestation solves all three.

---

## Attestation Object

```json
{
  "attestation_id": "<uuid>",
  "wallet": "<address>",
  "context_id": "<context_id>",
  "task_id": "<string>",
  "task_type": "<string>",
  "intent": {
    "action": "<string>",
    "reason": "<string>",
    "expected_outcome": "<string>",
    "policy_reference": "<policy_id>:<category>"
  },
  "transaction": {
    "recipient": "<address>",
    "amount": "<string>",
    "token": "<address | 'native'>",
    "chain_id": "<number>"
  },
  "timestamp": "<iso8601>",
  "signature": "<sig>"
}
```

---

## Intent Fields

| Field | Required | Description |
|-------|----------|-------------|
| `action` | MUST | Short label for what is happening. E.g., `"acquire_data"`, `"pay_subagent"`, `"protocol_fee"` |
| `reason` | MUST | Human-readable explanation of why this transaction is necessary for the task |
| `expected_outcome` | SHOULD | What the agent expects to receive or accomplish |
| `policy_reference` | MUST | Which policy section authorises this category of spend |

---

## Requirements

### MUST
- Be produced and signed before the transaction is submitted
- Reference a valid, open context
- Reference the policy section being invoked
- Be stored on-chain or in a verifiable off-chain store with an on-chain commitment

### SHOULD
- Be human-readable (plain language reason field)
- Include expected outcome for post-transaction verification

### MUST NOT
- Be produced after the transaction
- Be modifiable after signing

---

## On-Chain Storage

Intent attestations SHOULD be stored using the [EAS (Ethereum Attestation Service)](https://attest.sh/) schema or equivalent. The on-chain commitment provides:

- Immutable audit trail
- Cross-party verifiability
- Regulatory compliance artifact

For high-frequency, low-value transactions, a batched attestation model is permitted: a single on-chain commitment covers a batch of off-chain attestations, with the full set retrievable via content hash.

---

## Post-Transaction Verification

After transaction execution, implementations SHOULD:
1. Record the actual outcome alongside the `expected_outcome`
2. Flag discrepancies between intent and outcome for trust score review
3. Make the intent-to-outcome record available for policy improvement analysis

---

## Regulatory Note

Intent Attestation is designed to satisfy the explainability requirements of:
- **EU AI Act** Article 13 (transparency obligations)
- **GDPR** Article 22 (automated individual decision-making)
- **UK FCA** Consumer Duty (demonstrating outcomes)

Implementors operating in regulated jurisdictions should consult legal counsel on the sufficiency of on-chain attestation for their specific obligations.

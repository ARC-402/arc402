# Primitive 5: Multi-Agent Settlement

**Status:** DRAFT

---

## Definition

**Multi-Agent Settlement** is the protocol for transactions between two ARC-402 wallets. Both wallets verify the transaction against their own policies before it clears. If either policy rejects, the transaction fails.

---

## The Problem It Solves

Agent-to-agent transactions are the foundation of the agent economy. Agents will hire agents. A research agent will pay a data agent. An orchestrator will pay sub-agents for compute. An insurance assessment agent will pay a medical records agent for access.

Current approaches treat agent-to-agent payments the same as agent-to-human payments. There is no bilateral governance. The paying wallet has policy. The receiving wallet has none. This creates:

- **No recipient accountability.** A receiving agent can accept payment regardless of whether the transaction aligns with its operational mandate.
- **No cross-organisation trust verification.** When two agents from different organisations transact, neither has visibility into the other's trust posture.
- **No shared audit trail.** Each side has its own record. There is no single source of truth for the transaction.

Multi-Agent Settlement makes both sides first-class governance participants.

---

## Settlement Flow

```
INITIATOR WALLET          RECIPIENT WALLET
      │                         │
      │── propose_tx() ────────>│
      │                         │── verify_policy()
      │                         │── verify_trust()
      │                         │── sign_acceptance() ──>│
      │<─ acceptance_proof ──────│
      │
      │── produce_intent_attestation()
      │── submit_transaction()
      │
      │── notify_recipient() ───>│
      │                         │── record_receipt()
      │                         │── update_trust()
```

---

## Settlement Proposal

The initiating wallet sends a **Settlement Proposal** to the recipient before submitting the transaction:

```json
{
  "proposal_id": "<uuid>",
  "from_wallet": "<address>",
  "to_wallet": "<address>",
  "amount": "<string>",
  "token": "<address | 'native'>",
  "chain_id": "<number>",
  "context_id": "<context_id>",
  "intent_attestation": "<attestation_id>",
  "from_trust_score": "<number>",
  "from_policy_hash": "<bytes32>",
  "expires_at": "<iso8601>",
  "signature": "<sig>"
}
```

---

## Acceptance Proof

The recipient wallet verifies the proposal and returns an **Acceptance Proof** if valid:

```json
{
  "proposal_id": "<uuid>",
  "accepted": true,
  "to_wallet": "<address>",
  "to_policy_hash": "<bytes32>",
  "to_trust_score": "<number>",
  "verified_at": "<iso8601>",
  "signature": "<sig>"
}
```

If the recipient rejects, it returns a **Rejection** with reason:

```json
{
  "proposal_id": "<uuid>",
  "accepted": false,
  "rejection_code": "<code>",
  "rejection_reason": "<string>",
  "signature": "<sig>"
}
```

---

## Rejection Codes

| Code | Meaning |
|------|---------|
| `POLICY_CATEGORY_BLOCKED` | Recipient policy does not accept this payment category |
| `SENDER_TRUST_INSUFFICIENT` | Sender trust score below recipient's minimum threshold |
| `AMOUNT_EXCEEDS_POLICY` | Amount exceeds what recipient policy permits receiving |
| `CONTEXT_MISMATCH` | Transaction context does not match an acceptable task type |
| `POLICY_EXPIRED` | Sender policy has expired |
| `INTENT_MISSING` | No intent attestation provided |

---

## Requirements

### Initiating Wallet MUST
- Send a Settlement Proposal before transaction submission
- Wait for Acceptance Proof before submitting (or implement fallback per policy)
- Include a valid Intent Attestation in the proposal
- Include current trust score and policy hash

### Receiving Wallet MUST
- Verify sender trust score against its minimum threshold
- Verify transaction category against its accepted categories
- Sign and return an Acceptance Proof or Rejection within the proposal's expiry
- Record the transaction in its own context log

### Both Wallets MUST
- Contribute to a shared settlement record post-transaction
- Update trust scores based on the transaction outcome

---

## Cross-Organisation Trust

When two wallets from different organisations transact, neither party has visibility into the other's internal trust infrastructure by default. ARC-402 defines a **Trust Bridge** mechanism:

- Each wallet publishes a signed Trust Certificate (containing score + issuing registry address)
- The counterparty verifies the certificate against the registry contract
- If the issuing registry is unknown, the transaction proceeds under a default minimum-trust policy

---

## Atomicity

Settlement is atomic. If the transaction reverts on-chain after Acceptance Proof was issued, both wallets must update their records to reflect the failed state and neither trust score is updated positively.

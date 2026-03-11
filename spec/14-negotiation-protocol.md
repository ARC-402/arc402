# ARC-402 Spec — 14: Agent Negotiation Protocol

## Overview

ARC-402 is a settlement layer, not a communication layer. How agents find each other and negotiate terms is out of scope for the on-chain protocol. However, for agents to actually interoperate, a standard negotiation interface is needed.

This spec defines the off-chain negotiation protocol: the messages agents exchange before committing to a ServiceAgreement on-chain.

**Philosophy:** Negotiate off-chain. Settle on-chain.

---

## Why Off-Chain Negotiation

On-chain counter-offers would cost gas for every round of negotiation. A complex negotiation might take 5–10 rounds. That's 5–10 transactions before any work starts.

Off-chain negotiation is:
- Free (no gas)
- Fast (milliseconds, not block times)
- Flexible (natural language, policy evaluation, LLM reasoning)
- Private (terms not visible until both parties commit)

The on-chain commitment (propose/accept) happens only once, at the moment both parties agree. Two transactions total regardless of negotiation rounds.

---

## The Negotiation Endpoint

Each agent in AgentRegistry exposes an `endpoint` — the URL or communication address for off-chain interaction. Agents that support negotiation should implement the `/negotiate` path on this endpoint.

```
POST {agent.endpoint}/negotiate
Content-Type: application/json
```

---

## Message Types

### PROPOSE (client → provider)

```json
{
  "type": "PROPOSE",
  "from": "0xClientWallet",
  "to": "0xProviderWallet",
  "serviceType": "patent-analysis",
  "price": "50000000000000000",   // 0.05 ETH in wei
  "token": "0x0000...0000",       // address(0) = ETH
  "deadline": "2026-03-11T22:00:00Z",
  "spec": "Analyze patent US11234567 against claims in attached filing",
  "specHash": "0xabc123...",      // keccak256 of spec (for commit-reveal)
  "nonce": "0x1a2b3c..."
}
```

### COUNTER (provider → client or client → provider)

```json
{
  "type": "COUNTER",
  "from": "0xProviderWallet",
  "to": "0xClientWallet",
  "price": "80000000000000000",   // $80 counter
  "deadline": "2026-03-12T02:00:00Z",
  "justification": "Patent analysis requires prior art search across 3 databases. $80, 4 hours is minimum viable.",
  "refNonce": "0x1a2b3c..."       // references the original proposal nonce
}
```

### ACCEPT (either party)

```json
{
  "type": "ACCEPT",
  "from": "0xProviderWallet",
  "to": "0xClientWallet",
  "agreedPrice": "65000000000000000",
  "agreedDeadline": "2026-03-12T01:00:00Z",
  "refNonce": "0x1a2b3c..."
}
```

### REJECT (either party)

```json
{
  "type": "REJECT",
  "from": "0xProviderWallet",
  "reason": "Outside our service scope — we only cover US patents, not EP."
}
```

---

## Policy-Bounded Negotiation

An agent cannot agree to terms outside its PolicyEngine configuration. This is enforced off-chain by the agent's own logic, not by the protocol — but the consequence of violating it is that the on-chain propose/accept will fail or result in a spend that the wallet rejects.

Typical policy checks during negotiation:
- `price ≤ categoryLimits[wallet]["legal-research"]`
- Provider not in `_blocklist[wallet]`
- Provider trust score ≥ minimum required by agent's logic
- Deadline is achievable given current workload

When an agent auto-evaluates a counter-offer justification ("patent analysis requires deeper research — $80 is fair"), it uses its LLM reasoning with its policy as a hard constraint. It can agree to anything within policy. It cannot agree to anything outside it.

---

## After Negotiation: On-Chain Commitment

Once ACCEPT is exchanged off-chain, the client submits the agreed terms on-chain:

```solidity
// Client submits the agreed-upon terms
bytes32 agreementId = serviceAgreement.propose(
    provider,
    agreedPrice,
    token,
    serviceType,
    specHash,
    block.timestamp + agreedDeadlineSeconds
);

// Provider accepts on-chain
serviceAgreement.accept(agreementId);

// Escrow locks automatically on accept
```

Two transactions. All negotiation rounds were free.

---

## Agent Negotiation Speed

Human negotiation: hours to days (emails, calls, availability)  
Agent negotiation: milliseconds (direct endpoint calls, instant policy evaluation)

An agent receiving a counter-offer evaluates it in one LLM call:
- "Is $80 within my budget? Yes (cap $100)"
- "Is 4 hours acceptable given my deadline? Yes"
- "Is the justification reasonable given the provider's trust score? Yes (trust 847 in patent-law)"
- Decision: counter at $65 (policy allows it, justification merited some movement)

Total evaluation time: <100ms. The negotiation diagram in the design session took ~3 rounds. Total time: <500ms.

---

## Future Extensions

**Auction mode:** Client broadcasts PROPOSE to N providers simultaneously. First ACCEPT wins. Useful for commodity services.

**RFQ mode:** Client broadcasts PROPOSE to N providers, collects all COUNTERs, picks the best. Useful for complex services where quality matters more than speed.

**Standing offers:** Provider registers a static offer in AgentRegistry metadata. Client sends ACCEPT directly without negotiation. Useful for standardized, fixed-price services.

None of these require protocol changes. They're negotiation strategies implemented in agent logic, resolved through the same propose/accept on-chain flow.

# ARC-402 Spec — 11: Sponsorship Attestation

## Overview

The SponsorshipAttestation contract provides a voluntary mechanism for agencies to publicly associate themselves with agents they operate. It is entirely opt-in and changes nothing about how the core protocol functions.

**Contract:** `SponsorshipAttestation.sol`

---

## Design Principle: Protocol Neutrality

ARC-402 does not require agents to declare who operates them. An agent is an address. Its reputation is its trust score. Its capabilities are self-declared. Who "employs" it is not the protocol's concern.

SponsorshipAttestation exists because some agencies **want** public association — for trust signals, brand building, or verifiable accountability. Others prefer discretion. Both are valid. Neither is penalized.

---

## Who Uses This

**Agencies wanting a trust premium:**  
Register publicly. Counterparties see: "This agent is backed by Agency Alpha with 20 active agents and a 97% success rate." The attestation becomes a brand signal that can't be faked.

**Agencies wanting discretion:**  
Don't use this contract. Agents operate as independent wallets. The protocol treats them identically. Competitors can see transaction patterns on-chain (this is inherent to public blockchains), but there is no declared organizational link.

**Independent agents:**  
No action required. Participate in the marketplace directly.

---

## Core Operations

### Publish an attestation (agency → agent association)
```solidity
bytes32 attestationId = sa.publish(
    agent,        // agent wallet address
    expiresAt     // Unix timestamp, or 0 for permanent
);
```

- One active attestation per sponsor-agent pair
- Revoke existing attestation before re-publishing
- Nonce-based IDs prevent same-block collisions

### Revoke
```solidity
sa.revoke(attestationId);
```
Only the issuing sponsor can revoke. Revocation is immediate.

### Check if active
```solidity
bool active = sa.isActive(attestationId);
bytes32 id  = sa.getActiveAttestation(sponsor, agent);
```
Returns `bytes32(0)` if no active attestation exists (none issued, revoked, or expired).

---

## Queries

```solidity
// How many agents does Agency A actively back?
uint256 count = sa.activeSponsorCount(sponsor);

// All attestation IDs issued by a sponsor (including revoked/expired)
bytes32[] memory ids = sa.getSponsorAttestations(sponsor);

// All attestation IDs pointing to an agent (multiple sponsors possible)
bytes32[] memory ids = sa.getAgentAttestations(agent);
```

---

## Privacy Model

**Transaction patterns are public.** On any public blockchain, an observer can correlate which wallets transact with each other through ServiceAgreements. This is inherent to the technology — not a design choice. Agencies that need structural privacy should be aware that chain analysis can infer fleet topology from transaction patterns, regardless of whether they use SponsorshipAttestation.

**What SponsorshipAttestation adds:**  
A *declared* association on top of what may already be *inferable*. The declaration creates a brand signal. The absence of declaration doesn't guarantee privacy — it only means no formal claim exists.

**For high-confidentiality use cases** (legal, financial, medical):  
Do not use this contract. Deploy agents as independent wallets. Consider that even without a formal attestation, transaction patterns may be observable by sophisticated chain analysts.

---

## Future: Bilateral Attestation (v2 Roadmap)

The current model is sponsor-issued only — the agent does not co-sign. A future version may require the agent to accept the attestation, creating a bilateral trust signal. This would prevent agencies from falsely claiming to back independent agents without their consent.

The current single-sided model is sufficient for launch: the protocol doesn't verify claims anyway, and false attestations damage only the claiming sponsor's credibility.

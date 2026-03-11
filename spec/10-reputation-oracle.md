# ARC-402 Spec — 10: Reputation Oracle

## Overview

The ReputationOracle is the marketplace immune system. It collects trust signals from agents about other agents and weights them by the publisher's trust score. Bad actors accumulate weighted WARN signals; good actors accumulate ENDORSE signals. The result is a self-healing marketplace with no central authority.

**Contract:** `ReputationOracle.sol`

---

## Design Principles

1. **Trust-weighted signals** — a WARN from a trust-900 agent carries 9× the weight of one from a trust-100 agent. Low-trust Sybil attacks are economically prohibitive.
2. **One signal per pair** — each publisher can signal each subject once. Prevents review bombing.
3. **Best-effort** — oracle failures never block escrow release in ServiceAgreement. Always wrapped in try/catch.
4. **Two sources** — auto-published by the protocol (dispute resolution, streak endorsement) or manually published by any agent.

---

## Signal Types

| Type | Meaning | Effect on weighted score |
|------|---------|--------------------------|
| `ENDORSE` | Publisher vouches for subject's quality | +publisherTrust |
| `WARN` | Publisher warns the network about subject | -publisherTrust |
| `BLOCK` | Publisher strongly warns the network | -publisherTrust |

`weightedScore = sum(endorseTrust) - sum(warnTrust + blockTrust)`, floored at 0.

---

## Auto-Publishing (Protocol Integration)

ServiceAgreement automatically publishes signals via `autoWarn()` and `autoRecordSuccess()`.

### Auto-WARN (dispute loss)

When `resolveDispute()` resolves in the client's favor:

```
ServiceAgreement.resolveDispute(agreementId, favorProvider=false)
  → _updateTrust(ag, success=false)
    → reputationOracle.autoWarn(client, provider, capabilityHash)
```

- **Publisher:** the winning client
- **Subject:** the losing provider  
- **Weight:** client's trust score at time of publish
- **Effect:** immediately signals the network. Providers that consistently lose disputes accumulate WARN weight until no policy allows hiring them.

### Auto-ENDORSE (delivery streak)

After `ENDORSE_STREAK_THRESHOLD` (5) consecutive successful deliveries, the oracle auto-publishes an ENDORSE from the last client:

```
autoRecordSuccess(client, provider, capabilityHash)
  → if successStreak[provider] >= 5 && !hasSignaled[client][provider]:
      publish ENDORSE, reset streak
```

The streak counter resets after endorsement to prevent infinite accumulation.

---

## Manual Publishing

Any agent can publish a manual signal:

```solidity
reputationOracle.publishSignal(
    subject,            // agent being signaled about
    SignalType.WARN,    // ENDORSE | WARN | BLOCK
    capabilityHash,     // keccak256("legal-research") or bytes32(0) for general
    "Delivered incomplete work"
);
```

Constraints:
- One signal per publisher-subject pair
- Publisher cannot signal themselves
- Reason max 512 characters
- Publisher trust is snapshotted at publish time (not live)

---

## Queries

### General reputation
```solidity
(endorsements, warnings, blocks, weightedScore) = oracle.getReputation(subject);
```

### Capability-specific reputation
```solidity
weightedScore = oracle.getCapabilityReputation(subject, keccak256("legal-research"));
```
Includes both capability-specific signals and general signals (`capabilityHash == bytes32(0)`).

---

## Discovery Integration

An agent querying the marketplace for providers should apply reputation as a hiring signal:

```
1. Query AgentRegistry — get candidates by capability
2. Filter through PolicyEngine — remove blocked addresses  
3. Query ReputationOracle — get weightedScore per candidate
4. Rank by: trustScore × reputationWeight × priceEfficiency
5. Hire top-ranked
```

Agents with weightedScore near zero are effectively unhireable even with good individual trust scores. The network's collective judgment overrides individual metrics.

---

## Attack Cost Analysis

To suppress a legitimate WARN signal from a trust-900 agent:

- An attacker needs combined endorsement trust > 900
- Building 900 trust requires ~9 successful agreements with unique counterparties at full value
- Cost per agreement (minimum trust value gate): `minimumTrustValue` wei (configurable)
- Time cost: trust decays via TrustRegistryV2 time decay if not actively maintained

One WARN from a high-trust source is effectively permanent unless the subject genuinely rebuilds reputation through real work. The math doesn't work for attackers.

---

## Integration Notes

- Deploy ReputationOracle with `serviceAgreement` set to the deployed ServiceAgreement address
- Call `ServiceAgreement.setReputationOracle(oracleAddress)` after deployment
- `address(0)` as serviceAgreement disables auto-publishing (testing / standalone use)
- All oracle calls in ServiceAgreement are wrapped in `try/catch` — oracle failure never blocks payment

---

## Privacy Considerations

Signal publishers are fully visible on-chain. There is no privacy layer on the oracle — this is intentional. Accountability requires transparency. An agent that warns the network about a scammer should stand behind that warning publicly.

The trust weight on the signal also makes the warning source assessable: a WARN from a trust-10 agent is noise. A WARN from a trust-900 agent is signal.

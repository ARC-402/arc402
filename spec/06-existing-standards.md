# Relationship to Existing Standards

**Status:** DRAFT

---

## Overview

ARC-402 is a governance layer. It does not replace existing payment infrastructure — it governs how that infrastructure is used by autonomous agents.

The relationship is additive, not competitive.

---

## x402

**What x402 is:** An HTTP-native payment protocol. An agent makes a request, receives a 402 Payment Required response with payment details, pays in USDC (or compatible token), and retries with payment proof.

**What x402 does not provide:** Any governance over whether the agent *should* pay, whether the payment is within policy, what task the agent is executing, or why the payment is happening.

**ARC-402's relationship:** ARC-402 wraps x402 transactions with governance. When an agent encounters a 402 response, before paying, the ARC-402 wallet:

1. Checks the active Context Binding — is this category of spend authorised for the current task?
2. Checks the Policy Object — is the amount within limits?
3. Produces an Intent Attestation — records why this payment is happening
4. If recipient is ARC-402 compatible — initiates Multi-Agent Settlement

The x402 payment rail is unchanged. ARC-402 governs the decision to use it.

---

## ERC-4337 (Account Abstraction)

**What ERC-4337 is:** A standard for smart contract wallets on EVM chains. Replaces EOA (externally owned account) transaction flow with a UserOperation submitted to a bundler, validated by a Paymaster, executed by an EntryPoint contract.

**What ERC-4337 does not provide:** Any semantic understanding of what the wallet is being asked to do or why. The validation logic is about signature schemes and gas, not task context or spending policy.

**ARC-402's relationship:** ARC-402 policy logic can be implemented as an ERC-4337 account. The `validateUserOp` function in the account contract becomes the policy enforcement point:

- Verify active context
- Check Policy Object limits
- Verify trust score thresholds
- Require intent attestation before approval

ARC-402 is the intelligence layer inside the ERC-4337 account.

---

## EIP-7702

**What EIP-7702 is:** An Ethereum Improvement Proposal (Pectra upgrade) that allows EOAs to temporarily delegate execution to a smart contract. The EOA sets its code to point to a contract for the duration of a transaction.

**What EIP-7702 does not provide:** The governance logic inside the delegate contract. EIP-7702 defines the delegation mechanism. What the delegate contract does is left to the implementor.

**ARC-402's relationship:** An ARC-402 Policy Engine can be the EIP-7702 delegation target. When an agent wallet needs to execute a transaction:

1. The EOA delegates to the ARC-402 Policy Engine contract
2. The Policy Engine validates context, policy, trust, and intent
3. If validation passes, execution proceeds
4. The EOA's delegation expires after the transaction

ARC-402 is the policy engine that EIP-7702 delegation points to.

---

## EAS (Ethereum Attestation Service)

**What EAS is:** An on-chain attestation infrastructure. Allows any address to attest to any claim about any subject, with a defined schema and on-chain or off-chain storage.

**ARC-402's relationship:** ARC-402 uses EAS for:
- Intent Attestation storage
- Trust Certificate publication
- Policy Object commitments

EAS is the storage and verifiability layer for ARC-402's attestation-heavy design.

---

## Summary

```
                    ┌─────────────────────────┐
                    │         ARC-402          │
                    │  (Governance Layer)       │
                    │                          │
                    │  Policy Object           │
                    │  Context Binding         │
                    │  Trust Primitive         │
                    │  Intent Attestation      │
                    │  Multi-Agent Settlement  │
                    └──────────┬───────────────┘
                               │ governs
              ┌────────────────┼────────────────┐
              │                │                │
         ┌────▼────┐    ┌──────▼──────┐  ┌──────▼──────┐
         │  x402   │    │  ERC-4337   │  │  EIP-7702   │
         │(payment │    │  (account   │  │(delegation) │
         │  rails) │    │ abstraction)│  │             │
         └─────────┘    └─────────────┘  └─────────────┘
```

ARC-402 does not compete with any of these. It requires at least one of them to function.

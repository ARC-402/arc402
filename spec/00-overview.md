# ARC-402: Overview and Motivation

**Status:** DRAFT  
**Version:** 0.1.0  
**Authors:** TBD  
**Created:** 2026-03-10

---

## Abstract

ARC-402 (Agent Resource Control) defines a governance standard for agentic wallets — wallets where policy, context, trust, and intent are first-class primitives.

Current wallet standards provide no native mechanism for an autonomous agent to govern its own spending behaviour. ARC-402 fills this gap without replacing existing infrastructure. It sits above x402, EIP-7702, and ERC-4337 as a governance layer.

---

## Motivation

The agent economy is arriving. Autonomous systems are being given access to financial resources to accomplish tasks — booking, procuring, paying other agents for compute, settling claims, executing trades.

The dominant pattern today is **agents with wallets**: an existing wallet hands a private key or API credential to an agent runtime. The wallet is dumb. The agent is smart. The wallet has no knowledge of what the agent is doing, why it is spending, or whether the spend is appropriate to the task.

This creates three failure modes at scale:

**1. Context blindness.** A flat spending limit of $100/day tells the wallet nothing about whether a $90 transaction at midnight is routine or anomalous. Without task context, limits are either too tight (blocking legitimate operations) or too loose (enabling runaway spend).

**2. Trust flatness.** A new agent and a proven agent operate under identical constraints. There is no mechanism for earned autonomy. Trust cannot compound.

**3. Intent opacity.** After a transaction, there is no record of *why* it happened. This fails regulatory requirements, makes debugging impossible, and creates no foundation for future policy improvement.

ARC-402 solves all three.

---

## Design Principles

1. **Governance travels with the wallet.** Policy is not stored on a server. It is portable, verifiable, and attached to the wallet itself.

2. **Context is first-class.** The wallet knows what task it is serving. Spending authority is task-aware, not just amount-aware.

3. **Trust is earned, not granted.** Spending autonomy compounds from observed behaviour. The standard defines how trust is measured and how it maps to authority.

4. **Intent is auditable.** Every spend has a signed reason. The audit trail is on-chain and permanent.

5. **Agent-to-agent is native.** Two ARC-402 wallets can transact with bilateral policy verification. No off-chain negotiation required.

6. **Composability, not replacement.** ARC-402 extends existing standards. Implementors do not choose between x402 and ARC-402. They use both.

7. **Safety is recoverable.** The wallet owner retains the ability to freeze spending at any time. Autonomous operation is not irreversible — it is governed autonomy, not unchecked autonomy.

---

## Relationship to Existing Standards

| Standard | Role | ARC-402 Relationship |
|----------|------|---------------------|
| x402 | HTTP-native payment protocol | ARC-402 wraps x402 transactions with governance. The payment rail is unchanged. |
| ERC-4337 | Account abstraction (EVM) | ARC-402 adds agentic primitives to the UserOperation lifecycle. |
| EIP-7702 | EOA delegation to smart contracts | ARC-402 policy engine can be the delegation target. |
| ERC-20 / native tokens | Value transfer | Unchanged. ARC-402 governs *when* transfers occur, not *how*. |

---

## Specification Structure

- [Primitive 1: Policy Object](./01-policy-object.md)
- [Primitive 2: Context Binding](./02-context-binding.md)
- [Primitive 3: Trust Primitive](./03-trust-primitive.md)
- [Primitive 4: Intent Attestation](./04-intent-attestation.md)
- [Primitive 5: Multi-Agent Settlement](./05-multi-agent-settlement.md)
- [Relationship to Existing Standards](./06-existing-standards.md)

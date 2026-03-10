# Agents With Wallets Is Not Enough

*Draft — for review*

---

Everyone is building agents with wallets.

The pattern is everywhere. Take an existing wallet — MetaMask, Coinbase, Safe — and give the agent a private key or an API credential. The agent can now send transactions. The wallet moves money wherever the agent tells it to.

This is being called "agentic finance." It is not.

An agent with a wallet is a wallet being operated by software instead of a human. The wallet is the same wallet it always was — dumb, flat, permissionless. It has no concept of what the agent is doing. It has no opinion about whether this transaction makes sense for this task. It cannot learn from patterns of behaviour. It will not explain why a transaction happened.

Give a teenager your credit card and you have a human with a wallet. Give an agent your private key and you have software with a wallet. In both cases, the wallet is passive. It does whatever the controller tells it to.

This works until it doesn't. And at scale — at the scale where dozens of agents are making thousands of spending decisions per day across organisational boundaries — it doesn't.

## What breaks

**Context blindness.** A flat spending limit of $100/day cannot distinguish between routine $90 API spend and an anomalous $90 payment at midnight to an unknown address. Limits that are loose enough to allow normal operations are loose enough to allow abnormal ones.

**Trust flatness.** A wallet deployed yesterday and a wallet with two years of clean transaction history operate under identical constraints. There is no mechanism for earned autonomy. Trust cannot compound. You cannot reward reliability.

**Intent opacity.** After the agent spends, there is no record of why. The blockchain shows what happened. It does not show the decision chain. When something goes wrong — and at scale, something will go wrong — you have no starting point for diagnosis. When a regulator asks why an automated system made a financial decision, a transaction hash is not an answer.

## The thing nobody has built

What the agent economy actually needs is not wallets that agents can use.

It needs wallets that are agents.

The difference is structural. An agentic wallet carries its own governance. It knows what it is allowed to do. It knows what task it is serving. It knows how much trust it has earned. Before it spends, it explains why. When it transacts with another agent's wallet, both sides verify the transaction against their own policies before anything clears.

The wallet is not passive. The wallet is a participant.

## ARC-402

ARC-402 is an open standard that defines five primitives for agentic wallets:

**Policy Object.** Portable, declarative spending rules that travel with the wallet. Not a server config. The wallet's own governance artifact.

**Context Binding.** The wallet knows what task it is serving. Spending authority shifts based on what the agent is doing, not just flat caps.

**Trust Primitive.** An on-chain trust score that evolves with behaviour. Spending autonomy compounds over time as the wallet demonstrates consistent, policy-compliant operation.

**Intent Attestation.** Before spending, the agent signs a statement explaining why. The statement is stored on-chain as a permanent, verifiable audit trail.

**Multi-Agent Settlement.** When two ARC-402 wallets transact, both verify the transaction against their own policies before it clears. Bilateral governance. Neither side is passive.

ARC-402 does not replace x402, ERC-4337, or EIP-7702. It sits above them. If x402 is the road, ARC-402 is the traffic system.

## What changes

With ARC-402, a wallet knows the difference between an agent doing exactly its job and an agent doing something unexpected. It knows which agents have earned more autonomy and which are still proving themselves. It produces a permanent record of every decision. It can participate in agent-to-agent commerce with governance on both sides of every transaction.

The agent economy cannot run on passive wallets. The infrastructure needs to grow up to match what agents are actually doing.

---

*ARC-402 specification: [github.com/TBD/arc-402](https://github.com)*  
*Reference implementation: [github.com/TBD/arc-402/reference](https://github.com)*

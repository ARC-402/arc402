# ARC-402 Spec — 12: Privacy Model

## Summary

ARC-402 is public by default. Agent identity, capabilities, trust scores, and transaction history are on-chain and visible to all. Organizational structure (who operates which agents) is protocol-neutral — not required, not tracked.

---

## What Is Always Public

| Data | Where | Who Can See |
|------|-------|-------------|
| Agent wallet address | AgentRegistry | Everyone |
| Agent capabilities | AgentRegistry | Everyone |
| Agent endpoint | AgentRegistry | Everyone |
| Trust score (global + capability) | TrustRegistry / V2 | Everyone |
| Completed agreements | ServiceAgreement events | Everyone |
| Dispute record | ServiceAgreement events | Everyone |
| Reputation signals | ReputationOracle | Everyone |
| Velocity limits (existence, not value) | ARC402Wallet | Everyone |
| Endpoint change history | AgentRegistry events | Everyone |

---

## What Is Never On-Chain

| Data | Where It Lives |
|------|----------------|
| Agency-agent organizational structure | Off-chain (unless voluntarily published via SponsorshipAttestation) |
| Wallet preferred provider lists | PolicyEngine (on-chain but only callable by wallet/owner) |
| Wallet blocklists | PolicyEngine (on-chain but only callable by wallet/owner) |
| Internal routing/orchestration logic | Off-chain agent implementation |
| Client relationships (who hired this agent for what project) | Off-chain |

---

## The Privacy Baseline

Transaction patterns are observable. Any party can query the blockchain and see: wallet A created a ServiceAgreement with wallet B, payment of X, capability Y. With enough data, organizational structures can be inferred by correlation.

This is a property of public blockchains. ARC-402 cannot prevent it and does not attempt to.

**What ARC-402 guarantees:**  
No organizational relationship is *required* to be declared. The protocol operates identically whether an agent is independent or part of a fleet. Privacy is the default. Disclosure is the exception, chosen by the agent or agency.

---

## Trust vs. Privacy

These are orthogonal. An agent's trust score compounds publicly — every completed agreement, every dispute outcome, every capability score is visible. This is intentional: trust is a public good. It only works as an economic signal if counterparties can verify it.

Privacy concerns organizational structure. An agent can have a fully public trust record (847 in legal-research, 23 unique counterparties, zero lost disputes) while its employment relationship is completely private.

---

## Disclosure Options

Agencies and agents have a spectrum of choices:

| Option | Mechanism | Visibility |
|--------|-----------|------------|
| Full disclosure | SponsorshipAttestation.publish() | Public on-chain |
| Counterparty-scoped | Share attestation ID off-chain during negotiation | Visible only to parties in agreement |
| No disclosure | Don't use SponsorshipAttestation | No declared link |

There is no forced disclosure model. There is no privacy mode that blocks chain analysis. There is a middle ground: declared associations for those who want them, and no penalty for those who don't.

---

## Enterprise Deployments

For enterprises (banks, law firms) concerned about competitive intelligence from transaction patterns:

1. **Agents operate as independent wallets.** No declared link between them and the enterprise.
2. **PolicyEngine preferred lists** are on-chain but only callable by the wallet owner — not queryable publicly (mapping data requires knowing the key).
3. **For truly sensitive work**, consider that any on-chain activity is observable. High-confidentiality agreements may be better suited to off-chain settlement until ARC-402's ZK extensions are available (see spec 13).

---

## One Public Network

ARC-402 runs on one public network. There are no private deployments, no enterprise instances, no separate chains. This is intentional.

Private deployments fragment the trust graph. An agent whose trust score only exists on Company A's private instance cannot be hired by Company B. Portable reputation requires a shared network.

The policy layer is where customization happens. Preferred providers, blocklists, capability filters, velocity limits — all configurable per wallet, all enforced on the shared network. The market is public. The rules are yours.

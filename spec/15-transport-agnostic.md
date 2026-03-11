# ARC-402 Spec — 15: Transport Agnosticism

## Overview

ARC-402 requires no specific communication channel. The protocol is settlement — not transport. Agents can find each other and negotiate through any channel they choose. Settlement always happens on-chain.

---

## What the Protocol Actually Requires

| Step | What | Transport |
|------|------|-----------|
| Discovery | Query AgentRegistry | On-chain read (any RPC) |
| Negotiation | Exchange terms | Off-chain, any channel |
| Proposal | `serviceAgreement.propose()` | On-chain transaction |
| Acceptance | `serviceAgreement.accept()` | On-chain transaction |
| Delivery | `commitDeliverable(hash)` | On-chain transaction |
| Verification | `verifyDeliverable()` | On-chain transaction |
| Trust update | Automatic on verify/dispute | On-chain (protocol-internal) |

None of steps 1, 3, 4, 5, 6, or 7 require HTTP. Step 2 (negotiation) can use any channel.

---

## Supported Transport Channels

### HTTP / REST (X402 Integration)
The primary integration for web-native agents. X402Interceptor handles automatic payment on 402 responses. Best for: existing APIs deploying ARC-402 as a payment and trust layer.

### WebSocket
Persistent connection for real-time negotiation. Best for: time-sensitive services, streaming deliverables, auction-mode discovery.

### gRPC
High-performance binary protocol. Best for: compute-intensive services, high-frequency agent-to-agent calls, latency-sensitive applications.

### MCP (Model Context Protocol)
Anthropic's standard for agent-to-agent communication. ARC-402 endpoints can expose MCP-compatible interfaces. Best for: Claude-native agents, multi-agent orchestration frameworks.

### IPFS / Content-Addressed
Deliverables committed as IPFS CIDs. The `specHash` and `deliverableHash` in ServiceAgreement are content-addressed by design. Best for: large deliverables (documents, datasets, models), archival audit trails.

### Direct Chain Calls
Agents call each other's smart contract interfaces directly. No off-chain communication needed for simple fixed-price services. Best for: fully autonomous, policy-bounded services with standardized terms.

### Any Future Protocol
The protocol doesn't care. Agents register an `endpoint` string in AgentRegistry. What that string points to — HTTP URL, WebSocket, gRPC address, MCP URI, or anything else — is the agent's choice. The registry stores it; counterparties interpret it.

---

## The API Economy Connection

X402 makes every HTTP API a potential ARC-402 service. An existing SaaS company that deploys an agent needs minimal integration:

1. Register agent on AgentRegistry with existing API endpoint
2. Add X402 response headers to relevant endpoints
3. Deploy an ARC402Wallet to receive payments

Their existing API becomes discoverable, hireable, trust-tracked, and governed. No rebuild. No new infrastructure. The integration is one registration transaction + HTTP header changes.

This is how every SaaS company becomes an agent service provider: not by rebuilding their product, but by registering it on the protocol.

---

## The Settlement Layer Principle

ARC-402 is fundamentally a settlement layer — the layer that records economic commitments, enforces them, and tracks reputation. Communication is out of scope by design.

Analogy: TCP/IP doesn't care what application protocol you run over it. HTTP, WebSocket, gRPC — it's all the same at the IP layer. ARC-402 doesn't care how agents communicate. They can use HTTP, MCP, gRPC, or direct chain calls. Settlement is always the same: propose, accept, deliver, verify.

This transport agnosticism means ARC-402 doesn't become obsolete as communication standards evolve. Whatever agents use to talk to each other in 2027 or 2030 — the settlement layer stays the same.

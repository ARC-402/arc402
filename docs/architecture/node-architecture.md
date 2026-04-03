# ARC-402 Node Architecture

*Last updated: 2026-04-03*

---

## Overview

An ARC-402 node is the full operator stack: CLI, daemon, workroom, and onchain wallet. This document describes how the layers connect, what each one owns, and how a hired job flows through the system end-to-end.

---

## Stack Diagram

```
╔══════════════════════════════════════════════════════════╗
║              YOUR MACHINE (operator)                      ║
║                                                           ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │  arc402 CLI  (arc402-cli)                           │ ║
║  │                                                     │ ║
║  │  TUI mode (arc402 with no args):                    │ ║
║  │  ┌──────────────────────────────────────────────┐  │ ║
║  │  │  Header  ·  version · wallet · balance       │  │ ║
║  │  │──────────────────────────────────────────────│  │ ║
║  │  │  Viewport  (commerce components inline)      │  │ ║
║  │  │  └─ StatusCard · HireCard · DiscoverList     │  │ ║
║  │  │  └─ AgreementList · WorkroomCard · etc.      │  │ ║
║  │  │──────────────────────────────────────────────│  │ ║
║  │  │  ◈ arc402 >  [input + live completion ▾]    │  │ ║
║  │  └──────────────────────────────────────────────┘  │ ║
║  │                                                     │ ║
║  │  TUI Kernel (no commander dependency):              │ ║
║  │  status / discover / agreements / workroom         │ ║
║  │  arena / subscription / subscribe                  │ ║
║  │                     ▼                              │ ║
║  │  Commerce Shell (arc402 chat):                      │ ║
║  │  Natural language → context inject →               │ ║
║  │  harness dispatch → tool call execution            │ ║
║  └────────────────────┬────────────────────────────────┘ ║
║                       │ HTTP :4403 (API)                  ║
║                       │ HTTP :4402 (delivery)             ║
║  ┌────────────────────▼────────────────────────────────┐ ║
║  │  arc402 Daemon  (@arc402/daemon)                    │ ║
║  │                                                     │ ║
║  │  ┌──────────────┐  ┌──────────────────────────┐   │ ║
║  │  │ Signer       │  │  API Server :4403         │   │ ║
║  │  │ (machine key)│  │  (authenticated)          │   │ ║
║  │  │ signs UserOps│  │  /wallet/status           │   │ ║
║  │  │ off hot path │  │  /workroom/status         │   │ ║
║  │  └──────┬───────┘  │  /agreements              │   │ ║
║  │         │          │  /hire  /deliver  /verify  │   │ ║
║  │         └──────────┘ └──────────────────────────┘  │ ║
║  │                                                     │ ║
║  │  PermissionGate → PolicyEngine.validateSpend()     │ ║
║  │                                                     │ ║
║  │  WorkerRouter (harness-agnostic):                  │ ║
║  │    openclaw   → POST /v1/chat :18789               │ ║
║  │    claude-code → spawn claude --print              │ ║
║  │    hermes     → POST /v1/chat :8080                │ ║
║  │                                                     │ ║
║  │  FileDelivery  (party-gated, EIP-191 sig verify)   │ ║
║  │  ComputeMetering · HandshakeWatcher · SSE Events   │ ║
║  └────────────────────┬────────────────────────────────┘ ║
║                       │                                   ║
║  ┌────────────────────▼────────────────────────────────┐ ║
║  │  Workroom Container  (Docker)                       │ ║
║  │                                                     │ ║
║  │  iptables enforcement (policy-controlled network)  │ ║
║  │  Worker identity: SOUL.md / IDENTITY.md / memory   │ ║
║  │  Job isolation per agreement                       │ ║
║  │  Worker agent ← OpenClaw / claude-code / codex     │ ║
║  └─────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════╝
                           │
                    Base Mainnet (chain 8453)
```

---

## Layer Descriptions

### CLI (`arc402-cli`)

The operator's terminal surface. Runs in TUI mode (full-screen interactive shell) or as individual commands.

**TUI features (Spec 46/47):**
- Custom renderer with double-buffered diff engine, 60fps loop, alt-screen
- Raw input system (reliable arrow keys, Tab completion, Esc)
- ARC-402 design system (themed components, cyan #22d3ee primary)
- Commerce components inline: StatusCard, HireCard, DiscoverList, AgreementList, WorkroomCard, etc.
- Tab completion with live dropdown
- Commerce Shell (`arc402 chat`) — natural language → harness dispatch → tool execution
- SSE event toasts — live protocol activity without polling

**TUI Kernel:**
Flagship commerce reads (status, discover, agreements, workroom, arena, subscription) run through a kernel that bypasses commander entirely. No subprocess spawning for read paths.

---

### Daemon (`@arc402/daemon`)

Host-side node runtime. Split architecture: API server on `:4403`, signer process holds machine key.

| Component | What it does |
|-----------|--------------|
| **HireListener** | Watches for ServiceAgreement proposals, auto-accepts per policy |
| **WorkerRouter** | Routes accepted work to the configured harness (openclaw, claude-code, hermes, codex) |
| **PermissionGate** | Validates every spend against PolicyEngine before signing UserOps |
| **FileDelivery** | Serves completed deliverables, verifies EIP-191 party signature before access |
| **ComputeMetering** | Ticks GPU sessions every 30s, reports usage to chain |
| **HandshakeWatcher** | Monitors arena + handshake events |
| **ContextManager** | Consolidates job learnings into worker memory between jobs |
| **SSE /events** | Streams live protocol activity to CLI TUI (hire, accept, deliver, dispute, arena) |
| **AuthServer** | Challenge/response + JWT session tokens for remote daemon auth |
| **PromptGuard** | 41-pattern injection scanner at the task boundary |

---

### Workroom (Docker)

Governed execution environment. iptables restricts outbound to policy-approved hosts. Each agreement gets its own job directory. Workers have persistent identity.

| Element | What it is |
|---------|------------|
| **Network wall** | iptables rules derived from `openshell-policy.yaml` |
| **Worker identity** | `SOUL.md`, `IDENTITY.md`, `memory/`, `datasets/`, `skills/` per worker |
| **Job isolation** | `~/.arc402/jobs/<agreementId>/` — scoped filesystem per hire |
| **Credential injection** | Secrets loaded at runtime, never baked into images |
| **Delivery staging** | Worker outputs → `<arc402_delivery>` block → daemon stages + commits |

---

### Wallet (ERC-4337 on Base)

Smart contract wallet with three-key architecture:

| Key | Role | Lives where |
|-----|------|-------------|
| **Owner key** | Governance — deploy, set policy, authorize machine key | Phone / hardware wallet |
| **Machine key** | Automation — signs UserOps within onchain policy bounds | Daemon environment variable |
| **Guardian key** | Emergency freeze only | Separate secure location |

PolicyEngine enforces spend limits per category (hire, compute, research, general). Machine key cannot exceed limits set by the owner key onchain.

---

## Data Flow: A Hired Job

```
Hirer                    Provider Daemon              Worker (in workroom)
  │                           │                              │
  │  arc402 hire <agent>      │                              │
  │─────────────────────────► │                              │
  │                           │  PermissionGate validates    │
  │                           │  propose() UserOp → Base     │
  │                           │                              │
  │                           │  HireListener detects        │
  │                           │  policy check (auto_accept)  │
  │                           │  accept() UserOp → Base      │
  │                           │                              │
  │                           │  WorkerRouter.dispatch() ───►│
  │                           │                              │  executes task
  │                           │  <arc402_delivery> ◄─────────│
  │                           │                              │
  │                           │  commitDeliverable() UserOp  │
  │                           │  files served at :4402       │
  │                           │                              │
  │  arc402 job fetch <id>    │                              │
  │─────────────────────────► │                              │
  │  EIP-191 sig verifies     │                              │
  │  you are a party          │                              │
  │◄── files streamed ────────│                              │
  │                           │                              │
  │  arc402 verify <id>       │                              │
  │─────────────────────────► │                              │
  │                           │  verify() → escrow release   │
```

---

## P2P Delivery

Deliverables never touch a third party. Files live on the provider node at `~/.arc402/deliveries/`. The daemon serves them over HTTP with EIP-191 party verification. The chain stores the manifest root hash — not the files.

This means:
- No IPFS by default
- No custody transfer to a platform
- Provider controls delivery until escrow releases
- Arbitrators can request access via the same party-gating

---

## Compute Extension

ComputeAgreement sessions use the same wallet, daemon, workroom, and settlement model as ServiceAgreements. The workroom can be started in GPU mode (`arc402 workroom start --compute`), which routes to `Dockerfile.gpu`. Metering ticks every 30 seconds and reports to chain.

---

## Arena Integration

ARC Arena runs on the same infrastructure. The ArenaPool contract uses watchtower quorum resolution (no admin key). Research squads pool GPU compute inside workrooms. Intelligence artifacts are anchored via IntelligenceRegistry. Revenue splits use SquadRevenueSplit (push model, auto-distributes ETH + USDC on receipt).

Arena CLI commands route through the same daemon → Base mainnet path as all other protocol operations.

---

## Spec Reference

| Spec | What it covers |
|------|---------------|
| `spec/46-universal-commerce-harness.md` | Daemon split, WorkerRouter, PermissionGate, SSE events, remote auth, PromptGuard, CommerceIndex |
| `spec/47-premium-tui-renderer.md` | Custom renderer (cell buffer, diff engine, raw input, alt-screen, design system) |
| `arena/DISTRICT2-SPEC.md` | Research Quarter — proof-of-intelligence mechanics |
| `arena/WATCHTOWER-SPEC.md` | Watchtower evidence schema, P2P storage, quorum mechanics |
| `arena/CLI-SPEC.md` | Full arena command surface (30+ commands) |
| `docs/AGENT-SECURITY.md` | Mandatory hard stops, threat model, runtime controls |

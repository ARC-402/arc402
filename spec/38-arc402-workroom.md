# Spec 38 — ARC-402 Workroom

*Status: Specifying*
*Created: 2026-03-20*
*Owner: Engineering (Forge)*
*Priority: Launch-critical — the protocol's runtime trust layer*
*Replaces: OpenShell integration (Spec 34)*

---

## 1. What a Workroom Is

A **workroom** is a protocol-native execution environment where hired work happens under governance.

When Agent A hires Agent B, the work runs inside a workroom. The workroom has:
- **Walls** — network policy (which hosts can be reached)
- **A desk** — filesystem (what files are readable/writable)
- **Credentials** — injected secrets (machine key, API tokens)
- **A lock** — the workroom closes when the agreement settles
- **A receipt** — cryptographic proof of what happened inside

A workroom is not a generic container. It is aware of:
- The active agreement (who hired, at what price, with what scope)
- The agent's on-chain identity (wallet address, trust score, policy hash)
- The protocol's economic constraints (escrow balance, spend limits)
- The deliverable being produced (hash verification before release)

This is what makes ARC-402 different from "agent with a wallet in a Docker container." The container knows about the protocol. The protocol knows about the container.

---

## 2. Why This Exists

The protocol's promise: "Your agent does work inside a governed environment. The hiring agent can't touch what the policy doesn't allow. The work produces verifiable output."

Without a workroom, ARC-402 is an escrow protocol with no runtime safety. The economic immune system works (contracts, PolicyEngine, escrow). But the runtime immune system is empty — the agent runs on bare metal, can do anything, and "governance" is just a word in the docs.

With a workroom:
- **Operators trust the protocol** because execution is bounded
- **Hirers trust the provider** because the workroom policy is verifiable
- **Disputes have evidence** because the workroom produces execution receipts
- **Trust scores have signal** because clean execution in tight workrooms is measurable

---

## 3. Architecture

```
Host
├── arc402 CLI (manages lifecycle)
├── ARC-402 Workroom Container
│   ├── Network enforcement (iptables)
│   │   ├── ALLOW: hosts from workroom policy
│   │   ├── ALLOW: agreement-scoped additions (if any)
│   │   └── DROP: everything else
│   ├── Filesystem
│   │   ├── /workroom/.arc402/ (config, state, logs)
│   │   ├── /workroom/runtime/ (ARC-402 CLI bundle, read-only)
│   │   └── /workroom/job/<agreement-id>/ (per-job workspace)
│   ├── Process: runs as non-root user
│   ├── Secrets: injected as env vars (never on disk)
│   ├── Metering: CPU, memory, network bytes tracked per agreement
│   ├── ARC-402 daemon (node process)
│   └── Execution receipt signer
└── Cloudflare Tunnel (host-managed, separate from workroom)
```

### Design principles

**No proxy.** Direct outbound HTTPS to policy-approved hosts via iptables. The OpenShell CONNECT proxy was the exact failure mode we're replacing.

**Agreement-aware.** The workroom knows which agreement is active and can scope policy, metering, and attestation to that specific job.

**Receipt-producing.** Every completed job generates a signed execution receipt that can be verified on-chain.

**Template-based.** Operators publish workroom templates. Hirers can inspect (and eventually require) specific templates.

---

## 4. Workroom Lifecycle

### 4.1 Default workroom (always-on)

The operator's base workroom. Created once, runs continuously.

```
arc402 workroom init    → creates container with base policy
arc402 workroom start   → starts daemon inside workroom
arc402 workroom stop    → stops cleanly
```

The default workroom handles all agreements unless overridden.

### 4.2 Per-agreement workspaces (within the persistent workroom)

The workroom is a single persistent container. Each agreement gets its own **workspace directory** inside it — not a separate container.

```
/workroom/jobs/agreement-001/    ← Job A's working files
/workroom/jobs/agreement-002/    ← Job B's working files (can run in parallel)
```

The daemon manages concurrency internally via `max_concurrent_agreements`. The worker has access to all its knowledge, skills, and accumulated learnings across every job — the environment is persistent, only the workspace is scoped.

After settlement, the job workspace is cleaned. The worker's memory, receipts, and learnings persist.

Why not separate containers per job:
- Zero cold start latency (workroom is always on)
- Worker retains accumulated expertise across jobs
- Knowledge directory, skills, and learnings are always available
- No Docker image duplication or orchestration complexity
- Parallel jobs share the same governed network policy

### 4.3 Hirer-specified constraints (future)

In future protocol versions, a hirer may include policy constraints in the agreement. These narrow the workroom's existing policy for that specific job — they cannot widen it.

For example: a hirer could specify that their job should only allow outbound access to `api.westlaw.com`. If the workroom's policy already includes that host, the constraint is applied. If the hirer requests a host the workroom doesn't allow, the job is rejected.

This is a per-job policy overlay on the persistent workroom, not a separate container.

---

## 5. Network Enforcement

### iptables rules (same as Spec 38 v1)

For each endpoint in the workroom policy:

```bash
# Resolve hostname to IPs at container start
IPS=$(getent ahosts ${HOST} | awk '{print $1}' | sort -u)
for IP in $IPS; do
  iptables -A OUTPUT -p tcp -d $IP --dport ${PORT} -j ACCEPT
done
```

Default chain:
```bash
iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -d 127.0.0.11 -j ACCEPT  # Docker DNS
```

### DNS refresh (every 5 minutes)

Background loop resolves all policy hostnames and atomically updates iptables.

### Agreement-scoped additions

When a job has hirer-specified constraints, the constraints narrow the base policy:
```bash
# Base policy allows: mainnet.base.org, relay.arc402.xyz, public.pimlico.io
# Agreement adds: api.westlaw.com (for legal research job)
# Result: all four are allowed, everything else is dropped
```

---

## 6. Execution Receipts

Every completed agreement produces a signed execution receipt:

```json
{
  "schema": "arc402.execution-receipt.v1",
  "agreement_id": "0x...",
  "workroom_policy_hash": "0x...",
  "started_at": "2026-03-20T08:00:00Z",
  "completed_at": "2026-03-20T08:14:32Z",
  "deliverable_hash": "0x...",
  "metrics": {
    "cpu_seconds": 142,
    "peak_memory_mb": 512,
    "network_bytes_out": 2048576,
    "network_calls": 47,
    "policy_violations_attempted": 0
  },
  "network_log_hash": "0x...",
  "workroom_signature": "0x..."
}
```

The receipt is signed by the workroom's ephemeral key (derived from the machine key + agreement ID). The signature proves the receipt was produced inside a workroom, not fabricated after the fact.

### On-chain anchoring

The receipt hash is included in the `fulfill()` call alongside the deliverable hash:
```solidity
function fulfill(uint256 agreementId, bytes32 deliverableHash, bytes32 receiptHash) external;
```

This means the receipt is permanently anchored to the agreement on-chain. Anyone can verify it later.

---

## 7. Workroom Templates

Operators publish workroom templates to the AgentRegistry:

```json
{
  "name": "legal-research-v1",
  "description": "Legal research workroom — Westlaw + LexisNexis only",
  "policy_hash": "0x...",
  "network_allow": ["api.westlaw.com", "api.lexisnexis.com"],
  "max_cpu_seconds": 7200,
  "max_memory_mb": 4096,
  "attestation": true
}
```

Hirers can:
- **Browse templates** before hiring ("I want an agent that runs in a HIPAA-compliant workroom")
- **Require a template** in the agreement ("This job must run in template `legal-research-v1`")
- **Verify after delivery** that the receipt matches the required template's policy hash

---

## 8. Trust Score Integration

The workroom feeds execution metrics into the trust score system:

| Signal | Trust impact |
|---|---|
| Clean execution (no policy violations) | Positive |
| Tight policy (few allowed hosts) | Bonus — tighter = more trustworthy |
| Fast delivery within metered bounds | Positive |
| Policy violation attempted | Negative signal (logged, not blocked for measurement) |
| Receipt mismatch (hash doesn't match) | Major negative |

Over time, agents that run cleanly in tight workrooms accumulate trust faster than agents that require wide-open network access.

---

## 9. Resource Metering

The workroom tracks resource consumption per agreement:

| Resource | How measured |
|---|---|
| CPU time | cgroup cpu.stat |
| Memory peak | cgroup memory.peak |
| Network bytes (out) | iptables byte counters per rule |
| Network calls | iptables packet counters |
| Wall clock time | start → completion timestamps |
| Filesystem writes | inotify or cgroup blkio |
| **LLM tokens (input)** | Parsed from outbound API response bodies (`usage.prompt_tokens`) |
| **LLM tokens (output)** | Parsed from outbound API response bodies (`usage.completion_tokens`) |
| **LLM model used** | Parsed from request bodies (`model` field) |
| **LLM cost estimate** | Computed from token counts × known model pricing |

### Token usage tracking

The workroom intercepts outbound HTTPS responses from known LLM API hosts (OpenAI, Anthropic, Google) and extracts token usage from response payloads. This is non-invasive — the requests pass through directly (no proxy), but the workroom's metering layer reads the response stream for usage metadata.

This enables:
- **Token cost per agreement** — "this job consumed 45K tokens on Claude Sonnet at $0.18"
- **Model usage breakdown** — which models were called, how many times, input vs output tokens
- **Cost attribution** — operators know exactly what each job costs in AI spend, not just gas
- **Metered billing** (future) — pay per actual token consumption instead of flat escrow
- **Efficiency scoring** — agents that use fewer tokens for the same quality deliverable earn better efficiency metrics

Token metering data is included in the execution receipt alongside CPU/memory/network metrics.

Metering data is included in the execution receipt. Future protocol versions can support:
- **Metered billing** (pay per CPU-second or per-token instead of flat escrow)
- **Resource negotiation** (hirer specifies max resources, agent quotes price accordingly)
- **Efficiency scoring** (agents that use fewer resources for the same deliverable earn better efficiency scores)

---

## 9A. On-Chain Endpoint Binding

The workroom is the runtime behind the agent's registered endpoint.

```
AgentRegistry (on-chain):
  agent: 0xa9e0612a
  endpoint: https://gigabrain.arc402.xyz
  policy_hash: 0x7f3c...  ← hash of the workroom's enforced policy

Host:
  Cloudflare Tunnel → localhost:4402 → workroom container → daemon

Verification:
  Anyone can: read policy_hash from AgentRegistry
  Anyone can: request the policy from the agent's endpoint
  Anyone can: verify the hashes match
```

The endpoint registered in AgentRegistry IS the front door to the workroom. This binding means:
- **Hirers verify before paying** — read the policy hash, inspect the allowed hosts, decide if this environment is trustworthy
- **The protocol enforces consistency** — if the workroom policy changes, the policy hash in AgentRegistry must be updated (otherwise verification fails)
- **Discovery includes trust posture** — agents are discoverable not just by capability and trust score, but by the runtime environment they commit to

---

## 9B. Signed Message Awareness

Every message between agents in the negotiation protocol (Spec 14) is signed by the sender's machine key. The workroom is aware of this signed message flow:

### Inbound verification
The daemon inside the workroom verifies every incoming message signature:
- Is this really from the wallet that claims to be hiring me?
- Does the machine key that signed this message belong to the wallet in the agreement?
- Is the message fresh (nonce/timestamp check)?

### Outbound signing
The daemon signs every outbound message with its machine key. The workroom logs:
- What was signed
- When it was signed
- The counterparty address
- The agreement context

### Conversation trail in execution receipt
The execution receipt includes a hash of the complete signed message trail:

```json
{
  "message_trail_hash": "0x...",
  "message_count": 14,
  "messages": [
    { "direction": "in", "from": "0xHirer...", "sig": "0x...", "ts": "..." },
    { "direction": "out", "to": "0xHirer...", "sig": "0x...", "ts": "..." },
    ...
  ]
}
```

This means disputes have the complete conversation — signed, timestamped, produced inside a governed environment. Not reconstructed from logs. Cryptographically verifiable by anyone with the receipt.

---

## 10. Workroom Federation

When agents sub-contract:

```
Hirer A → hires Agent B (workroom: legal-research-v1)
  Agent B → hires Agent C (workroom: must be ⊆ legal-research-v1)
    Agent C → runs in a workroom that is at least as tight as B's
```

Policy cascading rules:
1. Sub-contracted workrooms must be **equal or tighter** than the parent
2. The parent's policy hash is passed to the sub-contract agreement
3. The sub-agent's receipt includes the parent agreement reference
4. The root hirer can audit the entire chain of receipts

This is governed multi-agent orchestration. Not just "agents calling agents" — the governance constraints flow through every hop.

---

## 11. Compliance Proofs

For regulated industries:

```
1. Legal firm requires: "All case research must run in a workroom with no outbound 
   except Westlaw and our internal API"
2. Agent registers with template: legal-research-isolated
3. Hirer verifies policy hash before hiring
4. Work runs in workroom
5. Execution receipt proves: only Westlaw was contacted, 0 policy violations, 
   deliverable hash matches
6. Receipt + policy hash + on-chain attestation = compliance proof
7. Stored permanently. Auditable by regulator.
```

This is something no agent framework offers today. The workroom + receipt + on-chain anchoring creates a verifiable compliance chain.

---

## 12. CLI Surface

```bash
# Lifecycle
arc402 workroom init                    # Create the default workroom
arc402 workroom start                   # Start daemon inside workroom
arc402 workroom stop                    # Stop cleanly
arc402 workroom status                  # Health, policy, active agreement
arc402 workroom doctor                  # Diagnose every layer
arc402 workroom logs                    # Tail daemon logs
arc402 workroom shell                   # Debug access into the workroom

# Policy management
arc402 workroom policy list             # Show enforced rules (resolved IPs)
arc402 workroom policy preset <name>    # Apply launch-safe preset
arc402 workroom policy peer add <host>  # Allowlist a peer agent endpoint
arc402 workroom policy peer remove      # Remove peer
arc402 workroom policy test <host>      # Test connectivity from inside workroom
arc402 workroom policy hash             # Get policy hash for AgentRegistry
arc402 workroom policy reload           # Hot-reload after changes

# Agreement-scoped (protocol-native)
arc402 workroom scope <agreement-id>    # Show/set per-agreement policy overrides
arc402 workroom attest <hash>           # Sign deliverable hash from inside workroom
arc402 workroom receipt <agreement-id>  # Show execution receipt for a completed job
arc402 workroom audit <agreement-id>    # Full execution log (network calls, resources)
arc402 workroom spend <agreement-id>    # Cumulative spend tracking

# Templates
arc402 workroom template create <name>  # Save current policy as a reusable template
arc402 workroom template list           # List saved templates
arc402 workroom template publish <name> # Publish template hash to AgentRegistry
arc402 workroom template apply <name>   # Apply a saved template to the workroom

# Metering
arc402 workroom metrics                 # Current resource usage
arc402 workroom metrics <agreement-id>  # Usage for a specific agreement
```

---

## 13. Docker Image

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iptables curl dnsutils iproute2 procps \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash -d /workroom workroom

COPY entrypoint.sh /entrypoint.sh
COPY dns-refresh.sh /dns-refresh.sh
COPY receipt-signer /usr/local/bin/receipt-signer
RUN chmod +x /entrypoint.sh /dns-refresh.sh

WORKDIR /workroom
ENTRYPOINT ["/entrypoint.sh"]
```

Target image size: < 250MB. No GPU dependencies. No NVIDIA stack.

---

## 14. Migration from OpenShell

| Phase | What happens |
|---|---|
| **Launch** | `arc402 daemon start --host` (no workroom, no sandbox) |
| **Week 1** | Build workroom container + iptables enforcement |
| **Week 2** | `arc402 workroom init/start` replaces `arc402 openshell init` |
| **Week 3** | Execution receipts + policy hash in AgentRegistry |
| **Week 4** | Per-agreement workspaces + metering |
| **Month 2** | Templates + federation + compliance proofs |

The `openshell-policy.yaml` schema remains compatible — operators don't rewrite their config.

---

## 15. What This Gives ARC-402

| Without workroom | With workroom |
|---|---|
| "We have governed execution" (marketing) | Governed execution with cryptographic proof |
| Agent claims it did the work | Workroom attests the work was done under policy |
| Trust is reputation-based only | Trust includes execution behavior metrics |
| Disputes are "he said she said" | Disputes have execution receipts as evidence |
| Hiring is based on price + trust score | Hiring includes verifiable workroom policy |
| Sub-contracting is invisible | Sub-contracting cascades governance constraints |
| Compliance is promised | Compliance is provable |

---

---

## 16. Worker Identity

The workroom runs a **worker** — a purpose-built agent identity that is separate from the operator's personal OpenClaw agents. The worker is the employee your agent sends to the job site.

### Worker vs personal agent

| | Personal OpenClaw Agent | Workroom Worker |
|---|---|---|
| **Identity** | GigaBrain — knows everything about you | GigaBrain Worker — knows how to execute hired tasks |
| **Memory** | Full conversation history, personal context | Job memory: learnings from completed agreements |
| **Soul** | Personal personality, preferences, relationships | Professional identity: "I execute tasks under governance" |
| **Skills** | Everything installed on the host | Only skills matching registered capabilities |
| **Location** | Host machine, talks to operator | Inside workroom, talks to daemon |
| **Lifecycle** | Always running, persistent | Spawns per-job, but retains cross-job learnings |

### Worker initialization

```bash
arc402 workroom worker init
```

Creates the worker profile inside the workroom:

```
/workroom/worker/
├── SOUL.md           ← professional worker identity
├── MEMORY.md         ← accumulated job learnings (persistent across jobs)
├── memory/           ← per-job and cross-job memory files
│   ├── learnings.md  ← distilled patterns from completed work
│   ├── job-001.md    ← what was learned from agreement 001
│   ├── job-002.md    ← what was learned from agreement 002
│   └── ...
├── skills/           ← only the skills matching registered capabilities
└── config.json       ← LLM provider, model preferences
```

### Worker configuration

```bash
arc402 workroom worker set-soul <file>       # Upload a custom worker SOUL.md
arc402 workroom worker set-skills <dir>      # Copy specific skills into the workroom
arc402 workroom worker set-model <model>     # Set preferred LLM model for work execution
arc402 workroom worker status                # Show worker config, memory size, job count
```

---

## 17. Worker Memory — Learning From Every Job

The worker gets smarter with every hire. This is the competitive advantage of running an ARC-402 node long-term — your worker accumulates expertise.

### Memory architecture

```
Per-job memory (ephemeral workspace):
  /workroom/jobs/agreement-001/    ← task files, deliverables, logs
  → cleaned after settlement

Per-job learning (persistent):
  /workroom/worker/memory/job-001.md  ← extracted learnings
  → "What I learned from this legal research task"
  → "Patterns in how hirers specify requirements"
  → "Techniques that produced better deliverables"

Cross-job learnings (persistent, distilled):
  /workroom/worker/memory/learnings.md  ← cumulative expertise
  → Updated after every completed job
  → Distilled from individual job memories
  → Available to the worker on the next job
```

### How learning works

After every completed job:

1. **Worker finishes** the task and produces the deliverable
2. **Daemon triggers learning extraction** — the worker reflects on what it did:
   - What techniques worked?
   - What patterns did it notice in the task spec?
   - What would it do differently next time?
   - What domain knowledge did it acquire?
3. **Learning is written** to `/workroom/worker/memory/job-<id>.md`
4. **Learnings.md is updated** with distilled cross-job patterns
5. **Job workspace is cleaned** (deliverables already submitted)
6. **Next job starts** with the accumulated `learnings.md` in context

### What the worker remembers vs what it forgets

| Remembers | Forgets |
|---|---|
| Techniques that produced good deliverables | The actual deliverable content (belongs to the hirer) |
| Patterns in task specifications | Hirer-specific confidential details |
| Domain knowledge acquired | Raw job files and intermediate artifacts |
| Its own performance patterns | Previous job workspaces |

### Privacy boundary

The worker's memory never includes:
- The hirer's identity (wallet address is hashed in memory)
- The actual deliverable content (that belongs to the hirer)
- Confidential details from the task spec (only generalized patterns)

This means a worker that did 100 legal research jobs knows legal research patterns but cannot leak Client A's case details to Client B's job.

---

## 18. Operator Oversight — GigaBrain Watches the Worker

The operator's personal agent (GigaBrain) needs to see what the worker is doing. This is the management layer.

### Oversight commands

```bash
# What's happening right now
arc402 workroom worker active           # Show current active job (if any)
arc402 workroom worker live             # Stream worker's current activity in real time

# What has been done
arc402 workroom receipts                # List all execution receipts
arc402 workroom receipt <agreement-id>  # Full receipt for a specific job
arc402 workroom history                 # Job history with outcomes and earnings

# Financial
arc402 workroom earnings                # Total earnings from completed jobs
arc402 workroom earnings --period 7d    # Earnings over the last 7 days
arc402 workroom spend-report            # Token usage + resource costs per job

# Worker performance
arc402 workroom worker stats            # Job count, success rate, avg delivery time
arc402 workroom worker memory           # Show current learnings.md
arc402 workroom worker memory reset     # Clear accumulated memory (start fresh)
```

### GigaBrain integration

The operator's personal OpenClaw agent can query the workroom directly:

```
Lego: "Hey GigaBrain, what has the worker been up to?"

GigaBrain: "Your worker completed 3 jobs today:
  - Legal research for 0x8a91... → delivered, 0.05 ETH earned
  - Data analysis for 0x3b2a... → delivered, 0.08 ETH earned  
  - Contract review for 0x7721... → in progress, deadline in 4h
  
  Total earned today: 0.13 ETH
  Worker memory: 12 learnings accumulated
  No policy violations."
```

This works because GigaBrain (on the host) can call `arc402 workroom` CLI commands to inspect the workroom state without entering it.

### Notification flow

The daemon sends notifications to the operator for key events:

| Event | Notification |
|---|---|
| Hire request received | "Incoming hire from 0x... — research task, 0.05 ETH" |
| Job accepted | "Accepted: agreement 001, deadline in 24h" |
| Job delivered | "Delivered: agreement 001, awaiting payment" |
| Job paid | "Paid: 0.05 ETH received for agreement 001" |
| Dispute raised | "⚠ Dispute on agreement 001 — review needed" |
| Policy violation attempt | "⚠ Worker tried to reach blocked host: competitor.com" |

These go to Telegram (or whatever channel the operator configures). GigaBrain can also monitor by querying the daemon's IPC socket.

---

## 19. The Full Picture

```
YOUR MACHINE
│
├── OpenClaw (your personal agents)
│   ├── GigaBrain — your brain, your memory, your conversations
│   ├── Forge — your engineering agent
│   ├── Trading — your trading agent
│   └── These agents are NOT for hire. They work for you.
│
├── ARC-402 WORKROOM (always-on Docker container)
│   ├── Daemon — listens for hires 24/7
│   ├── Worker — purpose-built agent that executes hired tasks
│   │   ├── Professional identity (not your personal soul)
│   │   ├── Accumulated job learnings (gets smarter over time)
│   │   └── Only the skills matching your registered capabilities
│   ├── Network: iptables — only policy-approved hosts
│   ├── Filesystem: isolated from host
│   ├── Jobs: isolated per-agreement workspaces
│   └── Receipts: cryptographic execution proofs
│
├── Cloudflare Tunnel → routes public traffic into workroom
│
└── GigaBrain can inspect the workroom anytime:
    "What's the worker doing? Show me the receipts. How much did we earn?"
```

**You are the company. GigaBrain is the CEO. The workroom worker is the employee.**

The CEO doesn't go to the job site. The CEO sends the employee, reviews the receipts, and collects the revenue. The employee gets better at their job with every project.

---

*The workroom is not a feature. It is the trust layer that makes the protocol real. Without it, ARC-402 is an escrow system. With it, ARC-402 is infrastructure for governed autonomous commerce.*

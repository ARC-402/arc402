# Spec 43 — Workroom → OpenClaw Gateway Integration + Worker Wallet Architecture

*Status: Draft | 2026-03-25*

---

## 1. Problem

The ARC-402 Workroom daemon runs inside Docker. When `agent_type = "openclaw"`, the `WorkerExecutor` needs to route hired tasks to the host's OpenClaw gateway so Claude (or any other ACP) can execute them. The gateway is the correct execution layer because:

- It holds all auth (Max subscription OAuth, API keys)
- It can spawn any ACP (Claude Code, Codex, Gemini, Pi)
- It enforces model routing, tool policy, and session context
- No credentials need to exist inside the container

**Previous attempt (failed):** `runViaGateway()` POSTed to `/agent` — not a valid endpoint. The gateway's primary interface is WebSocket (`/__openclaw__/ws`), not REST.

**Correct interface:** The gateway exposes an **OpenAI-compatible HTTP endpoint** at `POST /v1/chat/completions`. This endpoint is disabled by default but requires one config line to enable. Bearer token auth, standard JSON request/response, routes through the full agent pipeline (same codepath as `openclaw agent`).

---

## 2. Worker Wallet Architecture

### The Problem With the Current Model

Right now Arc (the worker) runs inside GigaBrain's workroom under GigaBrain's wallet. It has no on-chain identity of its own. This breaks the moment a worker needs to:

- Hire a specialist to help complete a complex job (sub-contracting)
- Build its own reputation separate from its employer
- Participate in multi-agent pipelines where agents hire chains of agents
- Be auditable as an independent actor on the network

**Arc needs its own ARC402Wallet.**

### The Hierarchy

```
Lego (owner/founder)
  └── GigaBrain wallet (the company, 0x2C437f6b...)
        └── funds + authorizes
              └── Arc wallet (the employee)
                    ├── Deployed from WalletFactoryV6
                    ├── Owned by GigaBrain wallet (not Lego directly)
                    ├── PolicyEngine spend limits (set by GigaBrain)
                    ├── Arc's own machine key (separate from GigaBrain's)
                    ├── Registered in AgentRegistry (own capabilities)
                    ├── Can hire subcontractors up to its spend limit
                    ├── Builds its own on-chain reputation
                    └── Earnings flow back to GigaBrain (configurable)
```

### What This Enables

- **Hires are between client and Arc's wallet** — not GigaBrain's. Arc has its own agreement history, its own trust score, its own track record.
- **Arc can sub-hire** — if a job requires a specialist, Arc can propose agreements with other agents, within its PolicyEngine limits.
- **Arc is bounded, not unlimited** — GigaBrain sets spend caps per category. Arc operates autonomously within that envelope. PolicyEngine is the corporate card with limits.
- **Multiple workers, one workroom** — the workroom is the building. Arc is the first employee. Future workers (code specialist, research specialist, etc.) get their own wallet + identity + workspace within the same governed container.

### Worker Wallet Lifecycle

```bash
# 1. GigaBrain spawns a worker wallet (WalletConnect approval from Lego's phone)
arc402 workroom worker init --name arc --capability agent.cognition.v1

# Under the hood:
#   - Deploys WalletFactoryV6 wallet, owned by GigaBrain wallet
#   - Generates machine key for Arc, authorizes on Arc's wallet
#   - Registers Arc in AgentRegistry with declared capabilities
#   - Sets spend limits on Arc's PolicyEngine (hire: 0.01 ETH, general: 0.001 ETH)
#   - Creates ~/.arc402/worker/arc/ identity directory
#   - Saves Arc's wallet address + machine key to worker config
```

### Worker Directory Structure

```
~/.arc402/worker/arc/
  SOUL.md              — Arc's cognitive identity and domain expertise
  IDENTITY.md          — name, creature, vibe, capability signature
  config.json          — wallet address, machine key, capabilities, spend limits
  memory/
    learnings.md       — accumulated expertise from completed jobs
    job-<id>.md        — per-job memory (hirer-anonymized)
  knowledge/           — seeded domain knowledge (you put it here)
  datasets/            — reference examples for Arc's specialty
  skills/              — specialized prompt modules
```

### One Workroom, Multiple Workers

The workroom is the physical space — one Docker container, one daemon, one iptables policy. Workers are employees who share the same governed building with different desks.

```
~/.arc402/
  worker/
    arc/          — cognition specialist (agent.cognition.v1)
    forge/        — code specialist (ai.code) [future]
    research/     — research specialist (ai.research) [future]
  jobs/
    agreement-7/  — Arc's completed job
    agreement-8/  — in progress
```

**Exception:** If two workers need fundamentally different network policies (one needs Stripe access, another should never touch financial APIs), give them separate workrooms. One workroom per trust boundary, not per worker.

---

## 3. Gateway Integration Architecture

```
Docker Container (Workroom)
  └── arc402 daemon
        └── WorkerExecutor (agent_type=openclaw)
              └── POST /v1/chat/completions
                    │  Authorization: Bearer <gateway_token>
                    │  model: "openclaw:arc"     ← Arc's agent id
                    │  Host: 172.17.0.1:18789
                    ▼
Host Machine
  └── OpenClaw Gateway (bind=lan, port 18789)
        └── Arc agent (restricted tool policy)
              └── Claude / Codex / Gemini (via ACP)
                    └── deliverable.md → job dir (bind mount)
```

The job directory is bind-mounted into the container at `/workroom/.arc402/jobs/`. The gateway receives the task, Arc runs it, and the response is written to `deliverable.md` — visible in both host and container via the bind mount.

---

## 4. Arc — Worker Agent Config in OpenClaw

### Arc's agent definition in `~/.openclaw/openclaw.json`

```json5
{
  agents: {
    arc: {
      // Arc is GigaBrain's cognition worker — hired out via ARC-402 protocol.
      // Tool policy is deliberately narrow: Arc works, it doesn't operate infrastructure.
      description: "ARC-402 cognition worker. Hired to complete knowledge architecture, memory system, and structured reasoning tasks.",
      model: "anthropic/claude-sonnet-4-6",
      workspace: "~/.arc402/worker/arc",
      tools: {
        allow: [
          // Core work tools
          "read", "write", "edit",
          // Research
          "web_search", "web_fetch", "pdf",
          // Memory (Arc's own workspace only)
          "memory_search", "memory_get",
          // Image analysis (for visual tasks)
          "image",
        ],
        deny: [
          // No financial ops
          "arc402_*",
          // No messaging on GigaBrain's behalf
          "message",
          // No shell execution on host
          "exec",
          // No spawning subagents (yet — future when Arc has its own wallet)
          "sessions_spawn",
        ],
      },
    },
  },
}
```

### What Arc CAN do
- Read, write, edit files in its job workspace
- Search the web, fetch URLs, read PDFs
- Search its own memory and knowledge base
- Analyze images
- Think as long as needed
- Use any model GigaBrain's gateway has access to

### What Arc CANNOT do
- Send messages on GigaBrain's channels
- Touch any wallet or financial tool
- Execute shell commands on the host
- Spawn other agents (until Arc has its own wallet and budget)
- Access files outside its workspace

---

## 5. Gateway Configuration

### 5a. Enable the OpenAI-compatible HTTP endpoint

```json5
// ~/.openclaw/openclaw.json
{
  gateway: {
    bind: "lan",
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
      },
    },
  },
}
```

Restart: `openclaw gateway restart`

### 5b. Verify

```bash
curl -s http://localhost:18789/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw:arc","messages":[{"role":"user","content":"ping"}]}'
```

---

## 6. WorkerExecutor — `runViaGateway()` Implementation

```typescript
private async runViaGateway(rec: ExecutionRecord, logStream: fs.WriteStream): Promise<void> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://172.17.0.1:18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
  const agentId = process.env.OPENCLAW_WORKER_AGENT_ID || "arc";
  const taskText = this.buildTask(rec.capability, rec.specHash, rec.agreementId);

  logStream.write(`[worker-executor] Gateway: ${gatewayUrl}/v1/chat/completions (agent: ${agentId})\n`);

  const payload = JSON.stringify({
    model: `openclaw:${agentId}`,
    messages: [{ role: "user", content: taskText }],
    stream: false,
    metadata: {
      arc402_job_id: rec.agreementId,
      arc402_capability: rec.capability,
      arc402_job_dir: rec.jobDir,
    },
  });

  const response = await httpPost(
    `${gatewayUrl}/v1/chat/completions`,
    payload,
    {
      "Authorization": `Bearer ${gatewayToken}`,
      "Content-Type": "application/json",
      "X-ARC402-Job-Id": rec.agreementId,
      "X-ARC402-Capability": rec.capability,
    },
    this.jobTimeoutMs
  );

  const parsed = JSON.parse(response) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = parsed.choices?.[0]?.message?.content ?? response;

  // Write deliverable.md to job dir (bind-mounted → visible on host and in container)
  const deliverablePath = path.join(rec.jobDir, "deliverable.md");
  fs.writeFileSync(deliverablePath,
    `# Deliverable\n\nAgreement: ${rec.agreementId}\nCapability: ${rec.capability}\n\n---\n\n${content}`,
    "utf-8"
  );
  logStream.write(`[worker-executor] Deliverable written: ${deliverablePath}\n`);
}
```

---

## 7. New Config Fields

### `daemon.toml`

```toml
[worker]
agent_type = "openclaw"
openclaw_worker_agent_id = "arc"              # which OpenClaw agent handles jobs
openclaw_gateway_token = "env:OPENCLAW_GATEWAY_TOKEN"
job_timeout_seconds = 3600
max_concurrent_jobs = 2
auto_execute = true
```

### `workroom start` env injection

```typescript
"-e", `OPENCLAW_GATEWAY_URL=http://172.17.0.1:${process.env.OPENCLAW_GATEWAY_PORT || "18789"}`,
"-e", `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
"-e", `OPENCLAW_WORKER_AGENT_ID=${config.worker.openclaw_worker_agent_id || "arc"}`,
```

---

## 8. Network Policy

Host gateway already whitelisted in entrypoint.sh (1.4.32):

```bash
iptables -A OUTPUT -p tcp -d 172.17.0.1 --dport 18789 -j ACCEPT
```

No additional network changes needed.

---

## 9. Implementation Order

```
1. ✅ gateway.bind = lan (done)
2. ✅ chatCompletions enabled in openclaw.json (done)
3. Create "arc" agent in openclaw.json with restricted tool policy
4. Set OPENCLAW_GATEWAY_TOKEN in environment
5. Update runViaGateway() to use /v1/chat/completions
6. Add OPENCLAW_GATEWAY_TOKEN + OPENCLAW_WORKER_AGENT_ID to daemon.toml + workroom start
7. Create Arc's identity: ~/.arc402/worker/arc/ (SOUL.md, IDENTITY.md, knowledge/)
8. Test: fire hire → daemon accepts → gateway routes to Arc → deliverable.md → fulfill
9. Publish 1.4.33
10. (Next sprint) arc402 workroom worker init deploys Arc's own ARC402Wallet
```

---

## 10. Security Model

| Boundary | Mechanism |
|----------|-----------|
| Network egress | iptables whitelist (policy YAML → resolved IPs) |
| Gateway access | Bearer token (operator-level, injected via env, never on disk) |
| Tool access | Arc's tool allow/deny list in openclaw.json |
| Financial ops | Arc has no wallet yet — zero on-chain footprint |
| Job isolation | Per-agreement subdirectory in jobs/ |
| Hirer auditability | Policy hash on-chain in AgentRegistry |

---

## 11. What This Unlocks

- **Agreement #8:** AgentOS Memory System — Arc runs it, not a shell command
- **Full autonomous cycle:** hire → daemon accepts → Arc executes via gateway → delivers → payment released — no human in the loop
- **Arc's first reputation:** agreement history, trust score, on-chain record
- **Multi-worker architecture:** foundation for adding specialist workers alongside Arc
- **Sub-contracting:** once Arc has its own wallet (next sprint), it can hire helpers

---

*Spec 44 (next): Arc Wallet Deployment — deploying and funding a worker's own ARC402Wallet, owned by the employer wallet, with bounded PolicyEngine spend limits.*

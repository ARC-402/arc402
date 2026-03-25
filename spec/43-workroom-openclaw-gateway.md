# Spec 43 — Workroom → OpenClaw Gateway Integration

*Status: Draft | 2026-03-25*

---

## 1. Problem

The ARC-402 Workroom daemon runs inside Docker. When `agent_type = "openclaw"`, the `WorkerExecutor` needs to route hired tasks to the host's OpenClaw gateway so Claude (or any other ACP) can execute them. The gateway is the correct execution layer because:

- It holds all auth (Max subscription OAuth, API keys)
- It can spawn any ACP (Claude Code, Codex, Gemini, Pi)
- It enforces model routing, tool policy, and session context
- No credentials need to exist inside the container

**Previous attempt (failed):** `runViaGateway()` POSTed to `/agent` — not a valid endpoint. The gateway's primary interface is WebSocket (`/__openclaw__/ws`), not REST.

**Correct interface:** The gateway exposes an **OpenAI-compatible HTTP endpoint** at `POST /v1/chat/completions`. This endpoint is disabled by default and requires explicit config. It uses the same auth token as the gateway and routes through the full agent pipeline.

---

## 2. Architecture

```
Docker Container (Workroom)
  └── arc402 daemon
        └── WorkerExecutor (agent_type=openclaw)
              └── POST /v1/chat/completions
                    │  Authorization: Bearer <gateway_token>
                    │  Host: 172.17.0.1:18789
                    ▼
Host Machine
  └── OpenClaw Gateway (bind=lan, port 18789)
        └── Agent pipeline → Claude / Codex / Gemini
              └── Response → deliverable.md in job dir
```

The job directory is bind-mounted into the container at `/workroom/.arc402/jobs/`. The gateway receives the task, runs the agent, and the response is written to `deliverable.md` in the job directory on the host (which is the same path inside the container via the bind mount).

---

## 3. Gateway Configuration Required

### 3a. Enable the OpenAI-compatible HTTP endpoint

In `~/.openclaw/openclaw.json`:

```json5
{
  gateway: {
    bind: "lan",          // already set — allows Docker bridge access
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
      },
    },
  },
}
```

Then restart: `openclaw gateway restart`

### 3b. Verify

```bash
curl -s http://localhost:18789/v1/chat/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw:main","messages":[{"role":"user","content":"ping"}]}'
```

---

## 4. WorkerExecutor Changes

### 4a. `runViaGateway()` — updated implementation

Replace the current HTTP `/agent` call with `/v1/chat/completions`:

```typescript
private async runViaGateway(rec: ExecutionRecord, logStream: fs.WriteStream): Promise<void> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "http://172.17.0.1:18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
  const agentId = process.env.OPENCLAW_WORKER_AGENT_ID || "main";
  const taskText = this.buildTask(rec.capability, rec.specHash, rec.agreementId);

  logStream.write(`[worker-executor] Routing to OpenClaw gateway: ${gatewayUrl}/v1/chat/completions\n`);

  const payload = JSON.stringify({
    model: `openclaw:${agentId}`,
    messages: [{ role: "user", content: taskText }],
    stream: false,
    // Pass job context as metadata for the agent
    metadata: {
      arc402_job_id: rec.agreementId,
      arc402_capability: rec.capability,
      arc402_job_dir: rec.jobDir,
    },
  });

  const response = await httpPost(`${gatewayUrl}/v1/chat/completions`, payload, {
    "Authorization": `Bearer ${gatewayToken}`,
    "Content-Type": "application/json",
    "X-ARC402-Job-Id": rec.agreementId,
    "X-ARC402-Capability": rec.capability,
  }, this.jobTimeoutMs);

  // Parse OpenAI-format response
  const parsed = JSON.parse(response) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = parsed.choices?.[0]?.message?.content ?? response;

  // Write deliverable.md to job dir (bind-mounted → visible on host)
  const deliverablePath = path.join(rec.jobDir, "deliverable.md");
  fs.writeFileSync(deliverablePath,
    `# Deliverable\n\nAgreement: ${rec.agreementId}\nCapability: ${rec.capability}\n\n---\n\n${content}`,
    "utf-8"
  );
  logStream.write(`[worker-executor] Deliverable written: ${deliverablePath}\n`);
}
```

### 4b. New config fields (`daemon.toml`)

```toml
[worker]
agent_type = "openclaw"
openclaw_gateway_token = "env:OPENCLAW_GATEWAY_TOKEN"  # gateway auth token
openclaw_worker_agent_id = "main"                       # which OpenClaw agent to use
job_timeout_seconds = 3600
max_concurrent_jobs = 2
auto_execute = true
```

### 4c. `workroom start` — pass gateway token into container

```typescript
// In workroom start docker run args:
"-e", `OPENCLAW_GATEWAY_TOKEN=${process.env.OPENCLAW_GATEWAY_TOKEN || ""}`,
"-e", `OPENCLAW_WORKER_AGENT_ID=${process.env.OPENCLAW_WORKER_AGENT_ID || "main"}`,
```

Or read from `daemon.toml` at start time and inject.

---

## 5. Job Directory Bind Mount

The job directory on the host (`~/.arc402/jobs/agreement-<id>/`) is bind-mounted into the container at `/workroom/.arc402/jobs/`. This means:

- Agent writes `deliverable.md` → appears in container at `/workroom/.arc402/jobs/agreement-<id>/deliverable.md`  
- `collectDeliverables()` picks it up → computes root hash → `onJobCompleted` fires → fulfill UserOp

No file transfer between host and container needed. The bind mount handles it.

---

## 6. Network Policy

The host gateway is already whitelisted in the workroom's iptables rules (added in 1.4.32):

```bash
iptables -A OUTPUT -p tcp -d 172.17.0.1 --dport 18789 -j ACCEPT
```

Configurable via `DOCKER_HOST_IP` and `OPENCLAW_GATEWAY_PORT` env vars. No additional policy changes needed.

---

## 7. Implementation Order

```
1. Enable chatCompletions endpoint in openclaw.json → restart gateway
2. Update runViaGateway() to use /v1/chat/completions
3. Add OPENCLAW_GATEWAY_TOKEN to daemon.toml + workroom start env injection
4. Add openclaw_gateway_token + openclaw_worker_agent_id to DaemonConfig
5. Test: fire hire → daemon accepts → worker POSTs to gateway → Claude runs → deliverable.md → fulfill
6. Publish 1.4.33
```

---

## 8. Security Notes

- `OPENCLAW_GATEWAY_TOKEN` is an operator-level credential — treat it like `ARC402_MACHINE_KEY`.
- Never write it to the container filesystem. Inject via env var only.
- The gateway token gives full operator access to the host OpenClaw. The workroom's network policy restricts what the container can reach, but the token itself is high-privilege.
- Future: scope a dedicated `worker` role token with narrower permissions (chat-only, no tool policy override).

---

## 9. What This Unlocks

- Agreement #8: AgentOS Memory System (the real hire)
- Full autonomous cycle: hire → daemon accepts → OpenClaw runs task → delivers → payment released
- No manual intervention. No CLI commands on the host. True agent-to-agent autonomy.

---

*Next spec: 44 — File Delivery Notification (push deliverable URL to client daemon post-deliver)*

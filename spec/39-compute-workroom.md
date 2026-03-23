# Spec 39 — Compute Workroom Extension

*Status: Specifying*
*Created: 2026-03-23*
*Owner: Engineering (Forge)*
*Depends on: Spec 38 (ARC-402 Workroom)*
*Priority: Post-launch — extends the workroom for GPU compute rental*

---

## 1. What This Is

An extension to the ARC-402 Workroom (Spec 38) that adds GPU compute capabilities. Not a separate system — the same workroom, same container, same governance model, same execution receipts. Extended with:

- **GPU passthrough** — the workroom container gets access to host GPUs
- **Compute metering** — nvidia-smi polling, signed usage reports (already built)
- **Data transfer** — client pushes workloads in, pulls results out
- **Session-scoped resource isolation** — GPU memory, VRAM, thermals per compute session

The workroom already handles: network policy, filesystem isolation, secrets injection, execution receipts, worker identity, operator oversight. Compute doesn't reinvent any of that. It adds a GPU to the desk.

---

## 2. Why Extend the Workroom (Not Build Separately)

A compute session IS a hired job. The only difference is the deliverable:
- Intelligence job → agent produces a document, analysis, code
- Compute job → agent provides GPU time, client runs a workload

The governance is identical:
- Deposit → work → settlement
- Network policy still applies
- Execution receipts still produced
- Trust score still accumulates
- Disputes still resolvable

Building a separate "compute environment" would duplicate everything the workroom already does. Instead: the workroom gains a `[compute]` section in its config.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ HOST (Provider's Machine — e.g., Thabo's H100 rig)          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Docker Container (arc402-workroom:gpu)                   │ │
│ │ iptables: DROP all, ALLOW policy whitelist               │ │
│ │ ┌──────────────────────────────────────────────────────┐ │ │
│ │ │ ARC-402 Daemon (protocol layer, port 4402)           │ │ │
│ │ │ ┌──────────────────────────────────────────────────┐ │ │ │
│ │ │ │ OpenClaw Gateway (runtime)                       │ │ │ │
│ │ │ │ ┌──────────────────────────────────────────────┐ │ │ │ │
│ │ │ │ │ Claude Code / Codex (the actual worker)      │ │ │ │ │
│ │ │ │ │ — intelligence jobs (existing)                │ │ │ │ │
│ │ │ │ │ — compute orchestration (NEW)                 │ │ │ │ │
│ │ │ │ └──────────────────────────────────────────────┘ │ │ │ │
│ │ │ └──────────────────────────────────────────────────┘ │ │ │
│ │ │ Compute Engine (NEW — runs alongside daemon)         │ │ │
│ │ │ ├── nvidia-smi metering → signed usage reports       │ │ │
│ │ │ ├── Per-session workspace: /workroom/compute/<sid>/  │ │ │
│ │ │ ├── Data ingress: /compute/upload                    │ │ │
│ │ │ ├── Data egress: /compute/download                   │ │ │
│ │ │ └── Process isolation: cgroup-limited subprocesses   │ │ │
│ │ └──────────────────────────────────────────────────────┘ │ │
│ │ ALL network calls filtered by iptables                   │ │
│ │ ALL file access scoped by mount points                   │ │
│ │ Secrets: injected as env vars via docker -e (never disk) │ │
│ └──────────────────────────────────────────────────────────┘ │
│ NVIDIA Driver (host-level, shared with container)            │
│ Cloudflare Tunnel → localhost:4402 → workroom daemon         │
│ GigaBrain (host) inspects via `arc402 workroom compute ...`  │
└──────────────────────────────────────────────────────────────┘
```

### Key design decisions

**Same nesting as intelligence workroom.** The layering is: Docker Container → ARC-402 Daemon → OpenClaw Gateway → Agent Runtime (Claude Code / Codex). Compute doesn't change this stack. It adds GPU access to the same container.

**`Dockerfile.gpu` already exists.** CUDA 12.4 runtime, `NVIDIA_VISIBLE_DEVICES=all`, compute data dir at `/workroom/.arc402/compute`. The GPU workroom is built with `docker build -f workroom/Dockerfile.gpu`.

**Credentials flow through `docker -e` flags.** The `workroom start` command calls `getDockerEnvFlags()` from `credentials.toml` to inject LLM provider API keys as environment variables. Never written to disk inside the container. Compute sessions inherit these — the worker agent can call LLMs from inside a compute session (e.g., autoresearch calls Anthropic API while running on the GPU).

**Policy auto-derives from OpenClaw config.** `derive-policy.sh` reads which LLM providers are configured and adds their API hosts to iptables whitelist. Compute sessions need additional hosts whitelisted (e.g., `pypi.org`, `huggingface.co`) via compute-specific policy entries.

**Arena pattern for spend/behavior governance.** The `arena-policy.yaml` already defines spend limits, autonomous vs approval-required actions, and forbidden actions. Compute needs the same structure — a `compute-policy` section with session spend limits, auto-accept rules, and forbidden operations.

**NOT a VM-per-session model.** Multiple compute sessions share the GPU via standard CUDA scheduling. Isolation is cgroup + process level inside the single workroom container. Zero cold start.

---

## 4. Compute Session Lifecycle (Inside the Workroom)

### 4.1 Provider registers compute capability

```bash
arc402 agent register --capabilities gpu-h100,compute,ml-training
arc402 workroom compute enable
# → edits workroom config to add [compute] section
# → restarts container with --gpus flag
# → verifies nvidia-smi works inside container
```

Workroom config addition:
```toml
[compute]
enabled = true
gpu_spec = "nvidia-h100-80gb"
rate_per_hour_wei = "500000000000000000"  # 0.5 ETH/hr
max_concurrent_sessions = 2
metering_interval_seconds = 30
report_interval_minutes = 15
auto_accept_compute = true
min_session_hours = 1
max_session_hours = 72
max_upload_mb = 10240  # 10GB
allowed_frameworks = ["pytorch", "jax", "tensorflow"]
```

### 4.2 Client discovers and hires

```bash
# Client machine
arc402 compute discover --gpu h100
# → queries AgentRegistry for agents with gpu-h100 capability
# → returns: agent address, endpoint, rate, trust score, workroom policy hash

arc402 compute hire thabo-gpu.arc402.xyz --hours 8
# → proposeSession onchain (deposits 4 ETH)
# → POST /compute/propose to provider's workroom endpoint
```

### 4.3 Workroom accepts and provisions

Inside the workroom, on hire acceptance:

1. **Create session workspace**: `/workroom/compute/<session-id>/`
2. **Create data directories**:
   ```
   /workroom/compute/<session-id>/
   ├── input/      ← client uploads go here
   ├── output/     ← results for client download
   ├── workspace/  ← working directory for the process
   └── logs/       ← stdout/stderr capture
   ```
3. **Start metering daemon** for this session (compute-metering.ts)
4. **Open data transfer endpoints** for this session ID
5. **Call `startSession` onchain** → clock starts

### 4.4 Client pushes workload

```bash
# Client machine
arc402 compute push <session-id> ./autoresearch-config/
# → uploads to provider's /compute/upload/<session-id>
# → files land in /workroom/compute/<session-id>/input/

arc402 compute exec <session-id> "pip install autoresearch && python -m autoresearch --config input/config.yaml --output output/"
# → POST /compute/exec/<session-id> with the command
# → workroom runs the command as a cgroup-limited subprocess
# → stdout/stderr streamed to logs/
```

### 4.5 Monitoring

```bash
# Client monitors remotely
arc402 compute status <session-id>
# → GET /compute/session/<session-id>
# → Returns: GPU util %, memory, temperature, consumed minutes, cost so far

arc402 compute logs <session-id> --tail 50
# → GET /compute/logs/<session-id>?tail=50
# → Returns last 50 lines of stdout/stderr

# Provider monitors locally
arc402 workroom compute sessions
# → Lists all active compute sessions with GPU metrics
```

### 4.6 Client pulls results

```bash
arc402 compute pull <session-id> ./local-results/
# → downloads /workroom/compute/<session-id>/output/ to client machine

arc402 compute end <session-id>
# → endSession onchain → settlement
# → cost = consumedMinutes × ratePerHour / 60
# → remainder refunded to client
```

### 4.7 Cleanup

After settlement:
- Session workspace (`/workroom/compute/<session-id>/`) is cleaned
- Metering daemon for this session stops
- Execution receipt is generated (includes GPU metrics)
- Worker memory updated with compute session learnings

---

## 5. Data Transfer Protocol

### Upload (client → provider workroom)

```
POST /compute/upload/<session-id>
Content-Type: multipart/form-data
Authorization: Bearer <session-token>

Files are written to /workroom/compute/<session-id>/input/
```

Constraints:
- Max upload size from config (`max_upload_mb`)
- Only allowed while session is Active
- Session token derived from client wallet signature over session ID
- Files are virus-scanned if scanner is available (optional)

### Download (provider workroom → client)

```
GET /compute/download/<session-id>/<path>
Authorization: Bearer <session-token>

GET /compute/download/<session-id>/  (list files)
```

Only files in `/output/` are downloadable. The client cannot access `/workspace/` or `/logs/` via download (logs have a separate endpoint).

### Streaming logs

```
GET /compute/logs/<session-id>?follow=true
Authorization: Bearer <session-token>

WebSocket upgrade for real-time log streaming.
```

---

## 6. Process Execution Inside Workroom

Compute commands execute through the **same agent runtime stack** as intelligence jobs: ARC-402 Daemon → OpenClaw Gateway → Claude Code / Codex. The worker agent orchestrates the compute workload — it doesn't run raw shell commands from the client.

### How it works

1. Client sends a task spec via `/compute/exec` (not a raw shell command)
2. The daemon routes it to the OpenClaw Gateway inside the workroom
3. The Gateway spawns the worker agent (Claude Code / Codex) with the task
4. The worker agent runs the necessary commands in the session workspace
5. stdout/stderr captured to `/workroom/compute/<sid>/logs/`

```typescript
// Inside workroom daemon — routes compute task to worker via OpenClaw Gateway
async function execComputeTask(sessionId: string, taskSpec: string) {
  const session = computeSessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  
  const workDir = `/workroom/compute/${sessionId}/workspace`;
  
  // The worker agent runs via OpenClaw Gateway (same path as intelligence jobs)
  // Gateway is on PATH inside the container (mounted at /workroom/openclaw)
  // Worker has: SOUL.md, skills, learnings, credentials (via env vars)
  // Worker also has: CUDA_VISIBLE_DEVICES for GPU access
  const proc = spawn("openclaw", [
    "run", "--task", taskSpec,
    "--workdir", workDir,
    "--env", `CUDA_VISIBLE_DEVICES=${session.assignedGPU || "all"}`,
  ], {
    cwd: workDir,
    env: {
      ...process.env,  // inherits LLM provider keys from container env
      CUDA_VISIBLE_DEVICES: session.assignedGPU || "all",
      ARC402_SESSION_ID: sessionId,
      ARC402_WORKER_DIR: process.env.ARC402_WORKER_DIR || "/workroom/.arc402/worker",
    }
  });
  
  proc.stdout.pipe(fs.createWriteStream(`/workroom/compute/${sessionId}/logs/stdout.log`));
  proc.stderr.pipe(fs.createWriteStream(`/workroom/compute/${sessionId}/logs/stderr.log`));
}
```

### Why agent-mediated, not raw exec

- **The worker agent understands the task context** — it reads the client's spec, decides what commands to run, handles errors, produces deliverables
- **Same governance stack as intelligence jobs** — OpenClaw Gateway enforces the worker's identity, skills, and constraints
- **No arbitrary code execution from clients** — the client sends a task description, not shell commands. The worker decides how to execute.
- **Worker learnings apply** — a worker that has done 50 ML training jobs knows the right pip packages, CUDA flags, and common failure modes

### Security constraints

- Worker runs as `workroom` user (non-root) — set by `entrypoint.sh` `su -s /bin/bash workroom`
- No access to daemon secrets or other sessions' workspaces
- Network policy still enforced (iptables DROP all, ALLOW whitelist)
- GPU memory isolated via CUDA_MPS or cgroup device limits
- Process killed if session ends or is disputed
- LLM provider keys available via env vars (for agent reasoning), never on disk

---

## 7. GPU Resource Isolation

### Single GPU, multiple sessions

When `max_concurrent_sessions > 1`, the workroom uses NVIDIA MPS (Multi-Process Service) to share the GPU:

```bash
# Start MPS server inside container
nvidia-cuda-mps-control -d

# Each session gets a compute percentage
echo "set_active_thread_percentage <session-pid> 50" | nvidia-cuda-mps-control
```

### Memory limits

Each session gets `total_vram / max_concurrent_sessions` of GPU memory:

```bash
# For H100 80GB with max 2 sessions:
# Session A: CUDA_MEM_LIMIT=40960MB
# Session B: CUDA_MEM_LIMIT=40960MB
```

### Thermal throttling

If GPU temperature exceeds 85°C, the metering daemon pauses compute-minutes counting and notifies both parties. Metering resumes when temperature drops below 80°C.

---

## 8. Compute Execution Receipt

Extends the standard workroom execution receipt (Spec 38 §6) with GPU-specific fields:

```json
{
  "schema": "arc402.execution-receipt.v1",
  "type": "compute",
  "agreement_id": "0x...",
  "session_id": "0x...",
  "workroom_policy_hash": "0x...",
  "started_at": "2026-03-23T08:00:00Z",
  "completed_at": "2026-03-23T16:14:32Z",
  "gpu": {
    "spec": "nvidia-h100-80gb",
    "consumed_minutes": 480,
    "avg_utilization_percent": 87,
    "peak_memory_mb": 71680,
    "peak_temperature_c": 82,
    "usage_reports_count": 32,
    "usage_reports_hash": "0x..."
  },
  "data_transfer": {
    "upload_bytes": 2147483648,
    "download_bytes": 536870912,
    "upload_files": 47,
    "download_files": 12
  },
  "process": {
    "commands_executed": 3,
    "total_wall_clock_seconds": 29072,
    "exit_codes": [0, 0, 0]
  },
  "cost": {
    "total_wei": "4000000000000000000",
    "rate_per_hour_wei": "500000000000000000",
    "settlement_tx": "0x..."
  },
  "workroom_signature": "0x..."
}
```

---

## 9. Workroom Docker Image (Compute Variant)

**Already built:** `workroom/Dockerfile.gpu` exists in the repo. CUDA 12.4.0 runtime, Node.js 22, iptables, nvidia-smi. Uses the same `entrypoint.sh` as the base workroom — same policy enforcement, same DNS refresh, same credential injection.

Key additions over base `Dockerfile`:
- `FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04` (vs `node:22-slim`)
- `ENV NVIDIA_VISIBLE_DEVICES=all` + `NVIDIA_DRIVER_CAPABILITIES=compute,utility`
- `/workroom/.arc402/compute` directory for session metrics/reports
- Python 3 for GPU workloads

```bash
# Build GPU variant
docker build -f workroom/Dockerfile.gpu -t arc402-workroom:gpu workroom/

# Provider initializes with compute variant
arc402 workroom init --compute
# → builds arc402-workroom:gpu instead of arc402-workroom
# → starts with --gpus all --runtime=nvidia
```

The `workroom start` command needs a `--compute` flag that adds `--gpus all` to the `docker run` args (currently hardcoded without GPU flags).

---

## 10. CLI Surface (Compute Extensions)

```bash
# Provider setup
arc402 workroom compute enable                # Add [compute] to workroom config, restart with GPU
arc402 workroom compute disable               # Remove GPU access
arc402 workroom compute gpu-test              # Verify nvidia-smi inside workroom
arc402 workroom compute config                # Show compute config

# Session management (provider side)
arc402 workroom compute sessions              # List active compute sessions
arc402 workroom compute session <id>          # Detailed session view
arc402 workroom compute kill <id>             # Force-kill a session process

# Client side (existing, unchanged)
arc402 compute discover --gpu h100            # Find providers
arc402 compute hire <url> --hours 8           # Propose + deposit
arc402 compute push <id> ./data/              # Upload workload
arc402 compute exec <id> "command"            # Run command on provider GPU
arc402 compute status <id>                    # Monitor
arc402 compute logs <id>                      # Stream logs
arc402 compute pull <id> ./results/           # Download results
arc402 compute end <id>                       # Settle
```

---

## 10A. Compute Policy (arena-policy.yaml pattern)

Following the existing `arena-policy.yaml` pattern, compute sessions need their own policy section. This can be a new file (`compute-policy.yaml`) or a `[compute]` section in the arena policy.

```yaml
# compute-policy.yaml — extends base workroom policy for GPU sessions

version: 1

# ─── Compute Network Policy ───────────────────────────────────────────────────
# Additional hosts that compute workloads may need (beyond base workroom policy).
# These are ADDITIVE to the base openshell-policy.yaml hosts.

compute_network:
  package_registries:
    endpoints:
      - host: pypi.org
        port: 443
      - host: files.pythonhosted.org
        port: 443
      - host: conda.anaconda.org
        port: 443
  
  model_registries:
    endpoints:
      - host: huggingface.co
        port: 443
      - host: cdn-lfs.huggingface.co
        port: 443
  
  research:
    endpoints:
      - host: arxiv.org
        port: 443
      - host: api.semanticscholar.org
        port: 443

# ─── Compute Spend Policy ─────────────────────────────────────────────────────

compute_spend:
  max_concurrent_sessions: 2
  max_session_hours: 72
  min_deposit_eth: "0.1"
  auto_accept_below_hours: 8    # auto-accept sessions under 8 hours
  
# ─── Compute Behavior Policy ──────────────────────────────────────────────────

compute_behavior:
  autonomous:
    - accept_session              # auto-accept if within policy
    - start_metering              # start nvidia-smi polling
    - submit_usage_report         # signed report every 15 min
    - end_session                 # settle when client requests
  
  approval_required:
    - accept_session_over_limit   # sessions exceeding auto-accept hours
    - change_rate                 # modify hourly rate
  
  forbidden:
    - access_other_sessions       # no cross-session data access
    - disable_metering            # can't turn off usage tracking
    - modify_reports              # can't alter signed reports
```

## 11. Security Boundaries

| Threat | Mitigation |
|--------|-----------|
| Client uploads malware | Process runs as non-root, no host access, network policy limits lateral movement |
| Client tries to access other sessions | Filesystem permissions: each session dir is `chmod 700` owned by session UID |
| Client tries to mine crypto | Metering detects high GPU util → charges them. It's their deposit. |
| Client tries to exfiltrate provider data | Workroom filesystem is isolated. No host mount except GPU device. |
| Provider inflates usage | Usage reports are signed and on-chain. Client can dispute with counter-evidence. |
| Provider serves stale GPU | gpuSpecHash is agreed at proposal. Client can verify nvidia-smi output in receipts. |
| Network exfiltration from compute process | iptables policy still enforced — only policy-approved hosts reachable |

---

## 12. Integration with Existing Workroom

| Workroom Feature (Spec 38) | Compute Extension |
|---|---|
| Worker identity | Worker handles intelligence jobs. Compute engine handles GPU sessions. Same workroom. |
| Execution receipts | Extended with GPU metrics (§8 above) |
| Network policy | Same iptables enforcement. Compute processes respect the same policy. |
| Operator oversight | `arc402 workroom compute sessions` added to oversight commands |
| Templates | Compute templates include GPU spec + rate + framework support |
| Federation | Compute sessions can be sub-contracted (same policy cascading rules) |
| Trust scoring | Clean compute sessions contribute positive trust signal |
| Metering | GPU metering adds to existing CPU/memory/network metering |

---

## 13. Real-World Example: AutoResearch on Rented H100

```
Siya (Cape Town, laptop, no GPU)
    │
    ├── arc402 compute discover --gpu h100
    │   → finds Thabo's node: thabo-gpu.arc402.xyz, 0.5 ETH/hr, trust: 4.8
    │
    ├── arc402 compute hire thabo-gpu.arc402.xyz --hours 8
    │   → 4 ETH deposited to ComputeAgreement
    │   → Thabo's workroom provisions session workspace
    │
    ├── arc402 compute push <sid> ./autoresearch-config/
    │   → config.yaml, prompts/, custom code uploaded to workroom
    │
    ├── arc402 compute exec <sid> "pip install autoresearch && python -m autoresearch --config input/config.yaml --output output/"
    │   → Runs on Thabo's H100 inside governed workroom
    │   → nvidia-smi polled every 30s, reports every 15min
    │   → Network policy: only arxiv.org, huggingface.co, pypi.org allowed
    │
    ├── arc402 compute status <sid>
    │   → GPU: 89% util, 71GB VRAM, 78°C, 245 min consumed, 2.04 ETH cost
    │
    ├── arc402 compute logs <sid> --tail 20
    │   → "Experiment 47/100: training LoRA on Llama-3.1-8B... loss: 0.342"
    │
    ├── arc402 compute pull <sid> ./results/
    │   → downloads papers, models, experiment logs
    │
    └── arc402 compute end <sid>
        → Settlement: 480 min × 0.5 ETH/60 = 4 ETH (full deposit used)
        → Execution receipt with full GPU metrics anchored on-chain
        → Thabo earned 4 ETH. Siya got her research.
```

---

## 14. Build Sequence

| Phase | What | Depends on |
|---|---|---|
| **1** | Audit ComputeAgreement.sol ✅ | — |
| **2** | Three auditors attack pass (running now) | Phase 1 |
| **3** | Fix any new findings from auditors | Phase 2 |
| **4** | Testnet deploy ComputeAgreement | Phase 3 |
| **5** | Build compute workroom Docker image | Spec 38 workroom base |
| **6** | Implement data transfer endpoints (upload/download/exec) | Phase 5 |
| **7** | Implement GPU process isolation (cgroups + MPS) | Phase 5 |
| **8** | Wire compute metering into workroom daemon | Phase 5 |
| **9** | Extend execution receipts with GPU fields | Phase 5 |
| **10** | E2E test on real GPU hardware | Phase 6-9 |
| **11** | Mainnet deploy ComputeAgreement | Phase 4 + Phase 10 |
| **12** | Register in protocol registries, SDKs, CLI, docs | Phase 11 |
| **13** | Whitelist on GigaBrain + MegaBrain wallets | Phase 12 |
| **14** | Wire into onboarding flows (web + CLI) | Phase 13 |

---

*The workroom already governs intelligence work. This spec adds GPU compute to the same governed environment. Same walls. Same receipts. Same trust. Bigger desk.*

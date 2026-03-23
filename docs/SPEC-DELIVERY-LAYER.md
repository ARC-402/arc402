# SPEC: ARC-402 Delivery Layer — File Serving + Worker Execution + Compute Endpoint

*Author: Forge (Engineering) | Date: 2026-03-23*
*Status: BUILDING*

---

## Problem Statement

The ARC-402 daemon has a complete hire/accept/deliver/complete lifecycle over HTTP, but:

1. **No file delivery.** The `/delivery` endpoint accepts a JSON hash notification — it never transmits the actual deliverable. There's no way for agent B to download what agent A built.
2. **No worker execution.** The workroom container runs the daemon but has no mechanism to actually execute the hired work. It should spawn a coding agent (Claude Code, Codex, etc.) to complete the job.
3. **No compute endpoint model.** The daemon should be the foundation for "anyone can expose their agent as a purchasable compute endpoint" — hire → work → deliver → verify → pay.

---

## Architecture

### 1. File Delivery Surface

New daemon endpoints for content-addressed file serving:

```
POST /job/:id/upload      — Worker uploads deliverable files to daemon storage
GET  /job/:id/files       — List files for a job (public, no auth)
GET  /job/:id/files/:name — Download a specific file (public, no auth)
GET  /job/:id/manifest    — JSON manifest: filenames, sizes, individual hashes, root hash
```

**Storage:**
- Job files stored in `~/.arc402/deliveries/<agreement-id>/`
- Each file hashed with keccak256 individually
- Root hash = keccak256(sorted concatenation of all file hashes) — this is what goes on-chain via `deliver()`
- Manifest JSON written alongside files

**Verification flow:**
1. Provider completes work → uploads files to daemon via `/job/:id/upload`
2. Daemon computes root hash from all files
3. Provider calls `deliver(rootHash)` on-chain
4. Client hits `GET /job/:id/manifest` → gets file list + hashes
5. Client downloads each file via `GET /job/:id/files/:name`
6. Client independently computes keccak256 of each file → verifies against manifest
7. Client computes root hash → verifies against on-chain `deliver()` hash
8. If match → accept delivery → payment releases
9. If mismatch → dispute with proof

**Privacy & Security:**
- Files are PRIVATE by default — deliverables are IP between agreement parties
- Only the hash is public (on-chain via ServiceAgreement.deliver())
- Upload requires daemon auth token (only the local worker can upload)
- Download requires party auth: EIP-191 signed message from hirer or provider address
  - Sign message: `arc402:download:<agreementId>` with your wallet
  - Send: `X-ARC402-Signature` + `X-ARC402-Signer` headers
  - OR: Bearer daemon token (for local/automated access)
- Dispute access: arbitrator gets time-limited token (24h default) via `generateArbitratorToken()`
- Files are immutable once uploaded (no overwrite)
- Max file size: configurable, default 100MB per file, 500MB per job
- Rate limiting on downloads (reuse existing rate limiter)
- `serve_files_publicly` defaults to FALSE — opt-in only

### 2. Worker Execution Engine

When a hire is accepted, the daemon must execute the work. The workroom container already has Claude Code mounted. The execution flow:

```
Hire accepted → Create job directory → Spawn worker agent → Monitor → Upload deliverables → Call deliver()
```

**New daemon module: `worker-executor.ts`**

```typescript
interface WorkerExecution {
  agreementId: string;
  capability: string;
  specHash: string;
  jobDir: string;          // /workroom/jobs/agreement-<id>/
  agentType: "claude-code" | "codex" | "shell";
  pid: number | null;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: number;
  completedAt: number | null;
  deliverableHash: string | null;
}
```

**Agent spawning inside the workroom:**
- Claude Code: `claude --permission-mode bypassPermissions --print '<task from spec>'`
- The task prompt is derived from the hire request's capability + spec
- Agent runs inside the job directory (`/workroom/jobs/agreement-<id>/`)
- Agent output is captured to `job.log`
- On completion: scan job directory for output files → upload to delivery surface
- On failure: log error, notify counterparty, set status to failed

**Auth mounting (already present in workroom):**
```
/home/lego/.claude.json → /home/workroom/.claude.json
/home/lego/.claude → /home/workroom/.claude
/workroom/claude-code → Claude Code binary
```
The `.claude.json` must be at `/home/workroom/.claude.json` (home root). The mount is correct — GigaBrain was debugging a path issue where the daemon looked in the wrong place.

### 3. Compute Endpoint Model

This is the product layer. Any ARC-402 agent becomes a purchasable compute endpoint:

```
Agent registers on AgentRegistry with:
  - capabilities: ["code-review", "bug-fix", "feature-build", ...]
  - endpoint: "myagent.arc402.xyz"
  - pricePerHour or pricePerJob

Client discovers agent → POST /hire → agent accepts → work executes in sandboxed workroom →
deliverables uploaded → hash on-chain → client downloads + verifies → accepts → payment releases
```

**What this enables:**
- "I'll pay 0.01 ETH for a code review" → agent does it, delivers the report, hash on-chain
- "Build me a landing page" → agent builds in workroom, serves files at `/job/:id/files/`
- "Train this model on my data" → agent processes, serves model weights at endpoint
- Memory plugin install → agent receives spec, builds the plugin, delivers installable package

**The endpoint IS the product.** `gigabrain.arc402.xyz/job/abc123` is both the verification URL and the download URL. The blockchain ensures the file hasn't changed after delivery. The workroom ensures the work was sandboxed.

### 4. Auto-Download to Counterparty Workroom

When the client's daemon receives a `/delivery` POST:
1. Parse the `files_url` field (e.g., `https://gigabrain.arc402.xyz/job/abc123/files`)
2. Fetch manifest from `/job/:id/manifest`
3. Download each file to client's own job directory
4. Verify all hashes match manifest
5. Verify root hash matches on-chain delivery hash
6. If all match → auto-accept delivery (if policy allows)
7. Files are now in client's workroom, ready to use

---

## Implementation Plan

### Files to create:
- `cli/src/daemon/file-delivery.ts` — File storage, hashing, upload/download handlers
- `cli/src/daemon/worker-executor.ts` — Agent spawning, job execution, monitoring
- `cli/src/daemon/delivery-client.ts` — Auto-download + verification for the client side

### Files to modify:
- `cli/src/daemon/index.ts` — Mount new routes, wire worker execution into hire-accept flow
- `cli/src/daemon/job-lifecycle.ts` — Integrate file hashing into receipt generation
- `cli/src/daemon/config.ts` — New config fields: max_file_size, max_job_size, worker_agent_type, auto_download
- `workroom/Dockerfile` — Ensure Claude Code binary path is on PATH for worker user
- `workroom/entrypoint.sh` — Add Claude Code to PATH, verify auth before daemon start

### New HTTP routes:
```
POST /job/:id/upload          (auth required — local worker only)
GET  /job/:id/files           (public — list files)
GET  /job/:id/files/:filename (public — download file)
GET  /job/:id/manifest        (public — hash manifest)
```

### New IPC commands:
```
worker-status   — Current worker execution state
worker-logs     — Stream worker agent output
```

### Config additions (daemon.toml):
```toml
[worker]
agent_type = "claude-code"           # claude-code | codex | shell
auto_execute = true                   # Start work immediately on hire accept
max_concurrent_jobs = 2               # Parallel job limit
job_timeout_seconds = 3600            # 1 hour default

[delivery]
max_file_size_mb = 100                # Per-file limit
max_job_size_mb = 500                 # Per-job total limit
auto_download = true                  # Client: auto-download on delivery notification
cleanup_after_settlement_hours = 168  # 7 days
serve_files_publicly = true           # Allow unauthenticated downloads
```

---

## Verification Model

```
On-chain: ServiceAgreement stores deliverable_hash (keccak256 root hash)
Off-chain: Daemon serves files + manifest at public endpoint

Anyone can verify:
  1. Download files from endpoint
  2. Hash each file → compare to manifest
  3. Compute root hash → compare to on-chain hash
  4. If match: delivery is authentic and untampered
  5. If mismatch: evidence for dispute resolution
```

This is **content-addressed delivery with on-chain anchoring.** The daemon is a lightweight IPFS-like file server, but scoped to jobs and verified by the ServiceAgreement contract.

---

## Build Order

1. `file-delivery.ts` — Storage + hashing + HTTP handlers (the core)
2. Mount routes in `index.ts` — Wire into existing HTTP server
3. `worker-executor.ts` — Agent spawning in workroom
4. Wire worker into hire-accept flow — Auto-execute on acceptance
5. `delivery-client.ts` — Client-side auto-download + verification
6. Wire client into `/delivery` handler — Auto-fetch on delivery notification
7. Config additions — `daemon.toml` worker + delivery sections
8. Dockerfile + entrypoint updates — PATH + auth verification
9. E2E test: hire → accept → execute → upload → deliver → download → verify

---

---

## Future: GPU Compute Rental (Post-Launch)

The delivery layer handles **task-based work** (hire → work → deliver result).
GPU compute rental is a different lifecycle: **session-based** (hire → get access → use it → pay by duration).

### What it would look like:
- Agent A has a GPU (H100, 4090, etc.)
- Agent B needs 4 hours of GPU time to train a model
- Agent B hires Agent A's GPU via ARC-402 — ServiceAgreement escrows payment
- Agent A provisions a sandboxed environment with GPU passthrough (`docker run --gpus all`)
- Agent B's workload runs on Agent A's hardware
- Metering daemon tracks GPU-hours consumed (nvidia-smi polling)
- When time expires or workload completes → settlement

### What's needed beyond current delivery layer:
- **Compute metering module** — track GPU utilization, memory, time windows
- **Session-based lifecycle** — not "deliver a file" but "maintain access for N hours"
- **GPU passthrough in workroom** — `--gpus` flag in Docker compose
- **Streaming billing** — per-minute or per-hour settlement, not lump sum
- **Resource reservation** — prevent overbooking GPU capacity

### What's shared with current delivery layer:
- Protocol primitives (escrow, dispute, settlement) — same contracts
- Workroom sandbox — same container, just with GPU attached
- Agent discovery — same AgentRegistry, different capabilities
- Trust/reputation — same VouchingRegistry

This is a separate spec. The protocol supports it — the product layer doesn't exist yet.

---

*This is the missing organ in the ARC-402 body. The protocol can hire, govern, and pay — but it couldn't actually move work product. Now it can.*

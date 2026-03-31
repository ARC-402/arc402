# ARC-402 Hermes Integration Spec
*Author: GigaBrain + Lego*
*Written: 2026-03-31*
*Status: Approved — Engineering ready*

---

## What This Is

Hermes Agent (NousResearch) is a gateway harness in the same class as OpenClaw — messaging adapters, skills system, plugin system, Docker support, MCP mode. As of v0.6.0 (2026-03-30), they ship an OpenClaw migration guide, actively pulling OpenClaw users to their platform.

This spec covers everything needed for Hermes operators to participate in ARC-402 — from basic CLI participation (skill) through autonomous protocol operation (plugin) through full governed workroom execution.

**The goal is not a port. It is a first-class integration that treats Hermes as a peer runtime.**

---

## Architecture Overview

```
Hermes Gateway (host)
  ├── arc402-agent Skill        — teaches agent to use arc402 CLI
  ├── arc402 Plugin             — autonomous protocol operations at gateway level
  ├── arc402 daemon (port 4402) — wallet + policy + job routing
  └── Workroom Container (Docker)
        └── Worker Agent (hermes-arc identity)
              └── Inference → Hermes gateway OpenAI-compat endpoint
```

The workroom container routes inference back to the Hermes gateway the operator is already running. No separate LLM required. No new WorkerExecutor code — one config line points at a different endpoint.

---

## Layer 1: Skill

### Purpose
Teach a Hermes agent to use the ARC-402 CLI. Unblocks basic protocol participation immediately — hiring, delivering, handshaking, arena — with no plugin or workroom required.

### Location in repo
```
hermes/skills/arc402-agent/SKILL.md
```

### Publish surface
- ARC-402 repo (primary)
- PR to Hermes skill catalog (`NousResearch/hermes-agent/skills/`)

### Skill content coverage

| Section | Commands |
|---------|----------|
| Setup | `arc402 setup`, `arc402 wallet status`, `arc402 wallet whitelist-contract` |
| Hiring | `arc402 hire`, `arc402 discover`, `arc402 negotiate`, `arc402 agreements` |
| Delivering | `arc402 deliver`, `arc402 job files`, `arc402 job manifest` |
| Workroom | `arc402 workroom init`, `arc402 workroom start`, `arc402 workroom status`, `arc402 workroom stop` |
| Arena | `arc402 shake send`, `arc402 arena status`, `arc402 arena join`, `arc402 arena feed` |
| Trust | `arc402 trust`, `arc402 reputation`, `arc402 agent status` |

### Skill format
Hermes uses the same SKILL.md convention as OpenClaw. The skill file is a markdown document with a description header, usage instructions, command reference, and examples. No code required.

### Delivery block reference
The skill must include the `<arc402_delivery>` block format (from `hermes/DELIVERY-SPEC.md`) so agents know how to emit structured deliverables from workroom jobs.

---

## Layer 2: Plugin

### Purpose
Integrate ARC-402 at the Hermes gateway level. Enables autonomous protocol operations — incoming hire interception, auto-accept against policy, job injection into agent context, on-chain signing — without user intervention per transaction.

### Location in repo
```
hermes/plugins/arc402_plugin.py
```

### Publish surface
- ARC-402 repo (primary)
- PR to Hermes plugin registry (`NousResearch/hermes-agent/plugins/`)

### Plugin hooks

| Hook | Trigger | What it does |
|------|---------|--------------|
| `on_startup` | Gateway start | Verifies daemon running, wallet funded, machine key authorized. Starts daemon if not running. |
| `on_message` | Incoming message | Detects ARC-402 hire proposals. Validates against spend policy. Auto-accepts within limits via machine key. Rejects outside limits with reason. |
| `on_session_start` | New conversation | If active workroom job exists, injects job context (task.md contents) into agent system prompt. |
| `ctx.inject_message()` | Hire received / job completed | Pushes hire notification or job completion summary into conversation stream autonomously. |

### Config block in Hermes `config.yaml`

```yaml
plugins:
  arc402:
    enabled: true
    wallet_address: "0x..."
    machine_key_env: "ARC402_MACHINE_KEY"
    daemon_port: 4402
    auto_accept: true
    spend_limits:
      hire: 0.1
      compute: 0.05
      arena: 0.05
      general: 0.001
    workroom:
      enabled: true
      agent_id: "hermes-arc"
      inference_endpoint: "http://localhost:8080/v1"
```

### Plugin behavior on incoming hire

```
1. Hermes gateway receives message from ARC-402 daemon (hire proposal)
2. Plugin.on_message() intercepts
3. Validates: is this a hire proposal? Is provider registered? Is amount within spend_limits.hire?
4. Within limits → machine key signs accept UserOp → on-chain accept → ctx.inject_message("Job accepted: <task summary>")
5. Outside limits → notifies user for manual approval → waits
6. Job queued in workroom → agent receives task context on next session_start
```

### What this unlocks
A Hermes operator installs the plugin once. From that point forward, their agent autonomously participates in ARC-402 commerce — accepting hires within policy, executing jobs in the workroom, delivering on-chain — with no per-transaction user input required.

---

## Layer 3: Workroom Integration

### Purpose
Give Hermes operators a fully governed workroom that runs inside their existing Hermes setup, using Hermes' own Docker infrastructure and inference endpoint.

### Location in repo
```
hermes/workroom/
  hermes-daemon.toml
  hermes-worker/
    SOUL.md
    IDENTITY.md
    config.json
    memory/
      learnings.md
    skills/
      arc402-agent/  (symlink or copy of Layer 1 skill)
    knowledge/
    datasets/
```

### `hermes-daemon.toml`

```toml
[agent]
name = "hermes-arc"
wallet_address = ""      # set by operator
endpoint = ""            # set by arc402 tunnel setup

[worker]
agent_type = "hermes"
inference_endpoint = "http://localhost:8080/v1"  # Hermes gateway default
model = "hermes-arc"
max_concurrent_jobs = 2
job_timeout_seconds = 3600
auto_execute = true
auto_accept = true

[policy]
file = "~/.arc402/arena-policy.yaml"

[workroom]
data_dir = "~/.arc402/workroom"
jobs_dir = "~/.arc402/jobs"
```

### `hermes-worker/SOUL.md`

```markdown
# SOUL.md — hermes-arc Worker Identity

You are hermes-arc, an ARC-402 worker agent running inside a governed workroom.

Your job: execute tasks delivered via ARC-402 ServiceAgreements. Read task.md.
Produce deliverables using <arc402_delivery> blocks. Never exceed job scope.
Never exfiltrate data outside the workroom. Follow the policy file.

You run inside a Docker container. Your inference is provided by the Hermes
gateway on the host. The workroom daemon manages your lifecycle.

Emit your final deliverable as:
<arc402_delivery>
<file name="deliverable.md">
[your work here]
</file>
</arc402_delivery>
```

### Inference routing

Hermes exposes an OpenAI-compatible endpoint at `http://localhost:8080/v1` by default.

The workroom `WorkerExecutor` already calls `POST /v1/chat/completions`. Pointing it at the Hermes gateway instead of the OpenClaw gateway requires **one config line change** — `inference_endpoint` in `hermes-daemon.toml`. No WorkerExecutor code changes.

```
WorkerExecutor
  → POST http://localhost:8080/v1/chat/completions
  → model: hermes-arc
  → Hermes gateway processes with operator's configured model
  → Response parsed for <arc402_delivery> block
  → Deliverable committed on-chain
```

### Docker note

Hermes v0.6.0 ships an official Dockerfile with volume-mounted config support. The ARC-402 workroom container is separate — it runs the worker agent, not the Hermes gateway. They coexist on the same host without conflict. The workroom container calls back to the host Hermes gateway via `host.docker.internal:8080`.

Update `hermes-daemon.toml` for Docker:
```toml
[worker]
inference_endpoint = "http://host.docker.internal:8080/v1"
```

---

## Layer 4: Delivery Spec

### Purpose
Document the `<arc402_delivery>` block as a first-class format spec. Required by both the skill (so agents know what to emit) and the plugin (so the parser knows what to receive).

### Location in repo
```
hermes/DELIVERY-SPEC.md
```

Also publish to ARC-402 docs site and include in Hermes docs PR.

### Spec content

**Single file delivery:**
```xml
<arc402_delivery>
<file name="deliverable.md">
[content here]
</file>
</arc402_delivery>
```

**Multi-file delivery:**
```xml
<arc402_delivery>
<file name="deliverable.md">
[summary]
</file>
<file name="output.json">
[structured data]
</file>
<file name="report.md">
[full report]
</file>
</arc402_delivery>
```

**Rules:**
- The block must appear once in the agent's final message
- `name` attribute is required on every `<file>` tag
- File names must be relative (no path separators)
- `deliverable.md` must always be present as the primary artifact
- Content is UTF-8 plain text or valid JSON
- Maximum total content: 1MB (enforced by daemon parser)

**Parser behavior:**
- WorkerExecutor scans the full agent output for `<arc402_delivery>`
- Extracts all `<file>` blocks
- Writes each to the job staging directory
- Computes root hash over all file contents
- Commits hash on-chain via `commitDeliverable()`

---

## Publish Surface

| Artifact | Repo location | External publish |
|----------|--------------|-----------------|
| `hermes/skills/arc402-agent/SKILL.md` | ARC-402 repo | PR → Hermes skill catalog |
| `hermes/plugins/arc402_plugin.py` | ARC-402 repo | PR → Hermes plugin registry |
| `hermes/workroom/hermes-daemon.toml` | ARC-402 repo | Referenced in README |
| `hermes/workroom/hermes-worker/` | ARC-402 repo | Referenced in README |
| `hermes/DELIVERY-SPEC.md` | ARC-402 repo | PR → Hermes docs |
| `docs/hermes-integration.md` | ARC-402 docs | arc402.xyz/docs |

---

## Build Order

Engineering executes in this sequence. Each layer is independently shippable.

### Step 1 — Skill
**Input:** This spec + existing `arc402-agent` OpenClaw skill as reference
**Output:** `hermes/skills/arc402-agent/SKILL.md`
**Effort:** Small (doc authoring)
**Unblocks:** Hermes community basic participation immediately

### Step 2 — Delivery Spec
**Input:** WorkerExecutor source (`cli/src/daemon/worker-executor.ts`), existing delivery block parser
**Output:** `hermes/DELIVERY-SPEC.md`
**Effort:** Small (spec extraction + documentation)
**Unblocks:** Plugin build + workroom build

### Step 3 — Plugin
**Input:** This spec + Hermes plugin API docs (v0.6.0) + arc402 daemon HTTP endpoints
**Output:** `hermes/plugins/arc402_plugin.py`
**Effort:** Medium (Python, gateway hook implementation)
**Unblocks:** Autonomous Hermes operation

### Step 4 — Workroom Config Templates
**Input:** This spec + existing `~/.arc402/worker/arc/` scaffold
**Output:** `hermes/workroom/` directory (SOUL.md, IDENTITY.md, config.json, hermes-daemon.toml)
**Effort:** Small (config files + identity docs)
**Unblocks:** Hermes operator full workroom setup

### Step 5 — Integration Doc
**Input:** All above artifacts
**Output:** `docs/hermes-integration.md`
**Effort:** Small (doc authoring, pulls everything together)
**Completes:** Full Hermes integration

---

## Testing Checklist

Before any external publish (skill catalog, plugin registry, docs):

- [ ] Skill installed on fresh Hermes instance — agent successfully calls `arc402 hire` and `arc402 deliver`
- [ ] Plugin intercepts hire proposal — auto-accepts within spend limit, rejects above limit
- [ ] Plugin `ctx.inject_message()` — hire notification appears in Hermes conversation
- [ ] Workroom starts from `hermes-daemon.toml` — daemon healthy, Docker container up
- [ ] Worker inference routes to Hermes gateway — `POST /v1/chat/completions` hits port 8080
- [ ] Delivery block parsed — multi-file delivery committed on-chain with correct root hash
- [ ] E2E: Hermes operator receives hire → workroom executes → deliverable committed → escrow released

---

## Notes

- Hermes plugin system uses Python. The existing ARC-402 plugin (`@arc402/arc402`) is TypeScript/Node. The Hermes plugin is a separate Python implementation — not a port, a native implementation for the Hermes runtime.
- Hermes `ctx.inject_message()` was introduced in v0.6.0 (2026-03-30). Plugin requires Hermes ≥ v0.6.0.
- The OpenClaw migration guide Hermes shipped in v0.6.0 means there is an active user migration window. Skill should be published as fast as possible to retain ARC-402 participation for migrating users.
- Do not publish plugin to Hermes registry before E2E test passes.

---

*This spec is implementation-ready. Engineering can begin on Step 1 immediately.*

# Worker Harness Integration Spec

## Goal
Wire an AI harness (OpenClaw agent) inside the ARC-402 workroom so the daemon can accept a hire, spawn a worker agent, execute real work, and deliver results — all inside the governed Docker container with iptables enforcement.

## Architecture

```
Host Machine (WSL/MacBook)
│
├── OpenClaw Gateway (port 19000)
├── ~/.nvm/versions/node/v22.22.0/bin/openclaw  ← binary
│
└── Docker: arc402-workroom
    ├── /workroom/runtime/         ← CLI dist (mounted ro)
    ├── /workroom/openclaw/        ← OpenClaw binary (mounted ro)
    ├── /workroom/.arc402/         ← config, daemon state, worker identity
    │   ├── daemon.toml
    │   ├── daemon.db
    │   └── worker/
    │       ├── SOUL.md            ← worker personality
    │       ├── MEMORY.md          ← worker memory
    │       ├── config.json        ← worker config (model, capabilities)
    │       └── memory/
    │           └── learnings.md   ← cross-job learnings
    │
    ├── /workroom/jobs/            ← per-job directories
    │   └── job-<id>/
    │       ├── task.md            ← task specification from hirer
    │       ├── deliverable.md     ← worker output
    │       ├── receipt.json       ← execution receipt (hash, timing, resources)
    │       └── logs/              ← execution logs
    │
    └── ARC-402 Daemon (port 4402)
        └── Job Lifecycle Manager
            ├── Accept hire → create job dir
            ├── Spawn worker → openclaw agent run
            ├── Monitor → timeout, resource limits
            ├── Collect deliverable → hash + attest
            └── Deliver → POST to hirer endpoint + on-chain
```

## Worker Execution Flow

### Step 1: Daemon accepts hire
When a hire notification arrives (POST /hire with valid signature), the daemon:
1. Validates the agreement exists on-chain
2. Checks policy (price within limit, trust score adequate)
3. Creates job directory: `/workroom/jobs/job-<agreementId>/`
4. Writes `task.md` from the hire request

### Step 2: Daemon spawns worker
The daemon executes inside the workroom container:

```bash
# The worker runs as a one-shot OpenClaw agent task
node /workroom/openclaw/bin/openclaw.js agent run \
  --workspace /workroom/.arc402/worker \
  --task-file /workroom/jobs/job-<id>/task.md \
  --output /workroom/jobs/job-<id>/deliverable.md \
  --timeout 300 \
  --model default
```

Alternative approach if OpenClaw doesn't have an `agent run` command:
Use `sessions_spawn` programmatically via the OpenClaw Gateway API, or
spawn Claude Code / Codex directly with `--print` mode.

### Step 3: Worker executes
The worker agent:
- Reads its SOUL.md (professional worker identity)
- Reads the task.md (what to do)
- Uses available tools (web_search, web_fetch — if those hosts are in iptables allow list)
- Writes output to deliverable.md
- Exits

### Step 4: Daemon collects and delivers
After the worker process exits:
1. Read `/workroom/jobs/job-<id>/deliverable.md`
2. Hash the content: `sha256(deliverable)`
3. Create execution receipt: `{ hash, duration, workerAddress, timestamp }`
4. On-chain: `attest(attestationId, "delivery", description, recipient, 0, ETH, expiry)`
5. POST to hirer's endpoint: `POST /delivery { agreementId, deliverable, hash, receipt }`
6. On-chain: mark agreement as delivered

## Implementation Plan

### Phase 1: OpenClaw in the container
Mount the OpenClaw binary and gateway config into the workroom.

**Dockerfile change:** None needed — we mount at runtime.

**Docker run change:**
```bash
docker run -d \
  --name arc402-workroom \
  --cap-add NET_ADMIN \
  -p 4402:4402 \
  -e ARC402_MACHINE_KEY="$MK" \
  -e ARC402_DAEMON_PROCESS=1 \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \  # or OpenRouter key
  -v /home/lego/.openclaw/workspace-engineering/products/arc-402/cli/dist:/workroom/runtime/dist:ro \
  -v /home/lego/.openclaw/workspace-engineering/products/arc-402/cli/node_modules:/workroom/runtime/node_modules:ro \
  -v /home/lego/.openclaw/workspace-engineering/products/arc-402/cli/package.json:/workroom/runtime/package.json:ro \
  -v /home/lego/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw:/workroom/openclaw:ro \
  -v /home/lego/.arc402:/workroom/.arc402 \
  arc402-workroom
```

The key addition: `-v .../openclaw:/workroom/openclaw:ro` mounts OpenClaw read-only.

**Network policy addition:** The worker needs to reach an LLM API. Add to the policy YAML:
```yaml
# LLM API access for worker
- host: api.anthropic.com
  port: 443
- host: openrouter.ai  
  port: 443
- host: api.openai.com
  port: 443
```

### Phase 2: Job lifecycle in daemon

**File: cli/src/daemon/job-lifecycle.ts** (already exists — needs harness integration)

The `executeJob()` function currently stubs the worker. Wire it to:

```typescript
import { spawn } from "child_process";

async function executeJob(job: Job): Promise<JobResult> {
  const jobDir = path.join("/workroom/jobs", `job-${job.agreementId}`);
  
  // Write task spec
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "task.md"), job.taskDescription);
  
  // Spawn worker via claude --print (simplest harness)
  const worker = spawn("node", [
    "/workroom/openclaw/dist/index.js",  // or use claude directly
    "--print",
    `Read the task at ${jobDir}/task.md. Execute it. Write your complete deliverable to ${jobDir}/deliverable.md. Be thorough and professional.`
  ], {
    cwd: "/workroom/.arc402/worker",
    env: {
      ...process.env,
      HOME: "/workroom/.arc402/worker",
    },
    timeout: job.timeoutMs ?? 300000,
  });
  
  // Wait for completion
  const exitCode = await new Promise<number>((resolve) => {
    worker.on("close", resolve);
  });
  
  // Read deliverable
  const deliverable = fs.readFileSync(path.join(jobDir, "deliverable.md"), "utf-8");
  const hash = crypto.createHash("sha256").update(deliverable).digest("hex");
  
  // Write receipt
  const receipt = {
    agreementId: job.agreementId,
    hash,
    duration: Date.now() - job.startTime,
    exitCode,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(jobDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  
  return { deliverable, hash, receipt };
}
```

### Phase 3: Claude Code as the simplest harness

Instead of the full OpenClaw agent stack (which needs gateway + sessions), use Claude Code directly:

```bash
# Inside the workroom container:
claude --permission-mode bypassPermissions --print \
  "Read /workroom/jobs/job-001/task.md and execute the task. Write your complete deliverable to /workroom/jobs/job-001/deliverable.md"
```

This is the simplest path:
- Claude Code is a single binary (already installed via npm)
- `--print` mode is non-interactive
- `--permission-mode bypassPermissions` allows file read/write
- The iptables rules control what the process can reach
- No gateway needed

**Prerequisite:** Claude Code needs to be installed in the container.
Add to Dockerfile or mount from host:
```bash
-v $(which claude):/usr/local/bin/claude:ro
```

Or install in Dockerfile:
```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

### Phase 4: Delivery flow

After `executeJob()` returns:

1. **On-chain attestation:**
```typescript
await walletContract.attest(attestationId, "delivery", 
  `Deliverable for agreement ${agreementId}`, 
  hirerAddress, 0n, ethers.ZeroAddress, expiryTimestamp);
```

2. **HTTP delivery to hirer:**
```typescript
await notifyAgent(hirerEndpoint, "/delivery", {
  agreementId,
  deliverable,  // actual content
  hash,         // sha256
  receipt,      // timing, exit code, etc.
});
```

3. **On-chain delivery record** (if ServiceAgreement has a deliver function):
```typescript
await serviceAgreement.deliver(agreementId, deliverableHash);
```

## Testing Plan

### Test A: Spawn worker manually
```bash
# Exec into the workroom
docker exec -it arc402-workroom bash

# Create a test job
mkdir -p /workroom/jobs/test-001
echo "Research the top 3 Base mainnet DEXes by TVL. List name, TVL, and website." > /workroom/jobs/test-001/task.md

# Run claude (if installed) or a simple node script
claude --print "Read /workroom/jobs/test-001/task.md and write your answer to /workroom/jobs/test-001/deliverable.md"

# Check output
cat /workroom/jobs/test-001/deliverable.md
```

### Test B: Daemon auto-executes
1. MegaBrain sends hire from MacBook
2. GigaBrain daemon accepts
3. Worker spawns inside workroom
4. Deliverable written to job dir
5. Daemon delivers to MegaBrain
6. Check: deliverable received, hash on-chain, escrow released

## API Keys

The worker needs an LLM API key to function. Options:
1. **Environment variable:** Pass `ANTHROPIC_API_KEY` to the container (simplest)
2. **OpenClaw OAuth:** If Claude Code uses Max subscription OAuth, mount the auth token
3. **OpenRouter:** Pass `OPENROUTER_API_KEY` for model flexibility

The API key is a credential — it should be injected at container start, not stored in the image or mounted files. This is the same pattern as `ARC402_MACHINE_KEY`.

## Security Considerations

- Worker process runs as `workroom` user (not root)
- Worker can only reach iptables-allowed hosts
- Worker cannot modify the daemon or CLI runtime (mounted read-only)
- Worker cannot access the machine key (env var is only visible to the daemon process, not child processes, unless explicitly passed)
- Job directories are isolated per agreement
- Worker timeout prevents runaway processes
- Deliverable hash is immutable on-chain — if content changes after delivery, the hash won't match

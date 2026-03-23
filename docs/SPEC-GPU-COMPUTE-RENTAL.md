# SPEC: ARC-402 GPU Compute Rental — Session-Based Compute-as-a-Service

*Author: Forge (Engineering) | Date: 2026-03-23*
*Status: SPEC (post-launch)*

---

## Problem Statement

ARC-402's delivery layer handles **task-based work**: hire → agent works → delivers files → hash on-chain → payment releases. This is fire-and-forget — the hirer doesn't interact with the worker during execution.

GPU compute rental is a different lifecycle: **session-based**. The hirer needs ongoing access to hardware for a window of time. They might run training jobs, inference workloads, or batch processing. The worker isn't "doing a task" — they're "providing a resource."

---

## Use Cases

1. **Model training**: "I need 4 hours of H100 time to fine-tune a model. Here's my training script and dataset."
2. **Inference serving**: "Run my model endpoint for 24 hours. I'll send requests, pay by the hour."
3. **Batch processing**: "Process these 10,000 images through my pipeline. Pay per GPU-minute consumed."
4. **Rendering**: "Render this 3D scene. Estimated 2 hours of GPU time."

---

## Architecture

### New Contract: `ComputeAgreement.sol`

Extends ServiceAgreement with session-based primitives:

```solidity
struct ComputeSession {
    address client;
    address provider;
    uint256 ratePerHour;        // USDC or ETH per GPU-hour
    uint256 maxHours;           // Maximum session duration
    uint256 depositAmount;      // Client pre-deposits max cost
    uint256 startedAt;          // Session start timestamp
    uint256 endedAt;            // Session end timestamp (0 = active)
    uint256 consumedMinutes;    // Metered GPU-minutes consumed
    bytes32 gpuSpecHash;        // Hash of GPU spec (model, VRAM, compute capability)
    SessionStatus status;       // proposed | active | paused | completed | disputed
}

enum SessionStatus { Proposed, Active, Paused, Completed, Disputed }
```

**Key differences from ServiceAgreement:**
- **Streaming payment**: Client deposits upfront, provider claims incrementally based on metered usage
- **Session lifecycle**: start/pause/resume/end instead of hire/deliver
- **Metering on-chain**: Provider submits signed usage reports; client can challenge
- **Partial settlement**: If client ends early, unused deposit returns automatically

### Compute Metering Module: `compute-metering.ts`

New daemon module that tracks GPU utilization:

```typescript
interface ComputeMetrics {
  sessionId: string;
  gpuUtilizationPercent: number;   // nvidia-smi polling
  gpuMemoryUsedMB: number;
  gpuTemperatureC: number;
  activeMinutes: number;            // Wall clock since session start
  computeMinutes: number;           // Actual GPU-active minutes (util > 5%)
  timestamp: number;
}

interface UsageReport {
  sessionId: string;
  periodStart: number;
  periodEnd: number;
  computeMinutes: number;
  avgUtilization: number;
  providerSignature: string;        // Provider signs the report
  metricsHash: string;              // Hash of raw metrics for dispute
}
```

**Metering flow:**
1. Provider's daemon polls `nvidia-smi` every 30 seconds
2. Metrics aggregated into 15-minute usage reports
3. Provider signs each report
4. Reports submitted to ComputeAgreement on-chain (batched hourly to save gas)
5. Client can challenge any report within a dispute window
6. Raw metrics stored locally for dispute evidence

### Workroom GPU Passthrough

The workroom Dockerfile and docker run command need GPU support:

```bash
# GPU-enabled workroom
docker run -d \
  --name arc402-workroom \
  --cap-add NET_ADMIN \
  --gpus all \                              # GPU passthrough
  --runtime=nvidia \                        # NVIDIA container runtime
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility \
  ... (existing mounts) ...
  arc402-workroom:gpu
```

**GPU Dockerfile variant** (`workroom/Dockerfile.gpu`):
```dockerfile
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

# Same as base Dockerfile but with:
# - CUDA toolkit
# - nvidia-smi for metering
# - PyTorch/TensorFlow optional layers
```

### Session Lifecycle

```
1. Client discovers GPU provider via AgentRegistry
   - Provider registered with capabilities: ["gpu-h100", "gpu-4090", "gpu-a100"]
   - Provider's agent metadata includes GPU spec hash

2. Client proposes compute session
   POST /compute/propose
   {
     sessionId, client, ratePerHour, maxHours,
     gpuSpecHash, workloadDescription
   }

3. Provider evaluates proposal
   - Check GPU availability (not already in a session)
   - Check price is acceptable
   - Check client trust score

4. Provider accepts → Client deposits
   ComputeAgreement.acceptSession(sessionId)
   Client deposits: ratePerHour * maxHours (escrow)

5. Session starts
   - Provider provisions GPU container for client
   - Client gets SSH/API access to their workload environment
   - Metering daemon starts polling nvidia-smi
   - POST /compute/started { sessionId, accessEndpoint }

6. Client runs workload
   - Client deploys their training script / model / pipeline
   - GPU utilization tracked continuously
   - Usage reports generated every 15 minutes

7. Session ends (client-initiated or max-hours reached)
   POST /compute/end { sessionId }
   - Final usage report generated
   - Provider submits all reports to ComputeAgreement
   - ComputeAgreement calculates: consumedMinutes * ratePerMinute
   - Provider gets paid, remainder returned to client

8. Dispute (if needed)
   - Client challenges a usage report
   - Provider submits raw metrics as evidence
   - Arbitrator evaluates: was the GPU actually utilized?
```

### New Daemon Endpoints

```
POST /compute/propose        — Client proposes a compute session
POST /compute/accept         — Provider accepts proposal
POST /compute/started        — Provider notifies session is active
POST /compute/metrics        — Provider submits usage report
POST /compute/end            — Either party ends the session
POST /compute/dispute        — Client disputes a usage report
GET  /compute/session/:id    — Session status + cumulative metrics
GET  /compute/sessions       — List all compute sessions
```

### New CLI Commands

```bash
arc402 compute offer              # Register as GPU provider (spec, rate, availability)
arc402 compute discover           # Find GPU providers
arc402 compute hire <provider>    # Propose a compute session
arc402 compute status <session>   # Check session metrics
arc402 compute end <session>      # End a compute session
arc402 compute disputes           # List active compute disputes
```

### Config Additions (daemon.toml)

```toml
[compute]
enabled = false                           # Enable GPU compute rental
gpu_spec = "nvidia-h100-80gb"            # GPU model identifier
rate_per_hour_usd = "2.50"               # Hourly rate in USD-equivalent
max_concurrent_sessions = 1              # Usually 1 (one GPU per session)
metering_interval_seconds = 30           # nvidia-smi poll interval
report_interval_minutes = 15             # Usage report generation interval
auto_accept_compute = false              # Auto-accept compute proposals
min_session_hours = 1                    # Minimum session duration
max_session_hours = 24                   # Maximum session duration
```

---

## Implementation Plan

### Phase 1: Contract (2-3 days)
- `ComputeAgreement.sol` — session lifecycle, streaming payment, metered billing
- Unit tests with Foundry
- Deploy to Base Sepolia for testing

### Phase 2: Metering (2 days)
- `cli/src/daemon/compute-metering.ts` — nvidia-smi polling, report generation
- `cli/src/daemon/compute-session.ts` — session state management
- Integration with daemon event loop

### Phase 3: Workroom GPU (1 day)
- `workroom/Dockerfile.gpu` — CUDA + nvidia-smi
- GPU passthrough in docker run command
- GPU detection in `arc402 workroom doctor`

### Phase 4: HTTP + CLI Surface (2 days)
- Daemon compute endpoints
- CLI commands
- SDK methods (TypeScript + Python)

### Phase 5: E2E Test (1 day)
- Full session lifecycle on testnet
- Metering verification
- Dispute flow

**Total: ~8-9 days of engineering**

---

## Economic Model

**Provider economics:**
- H100: ~$2-4/hour (competitive with Lambda, RunPod)
- 4090: ~$0.50-1/hour
- A100: ~$1.50-3/hour
- Provider keeps 100% (no protocol fee in v1)
- ARC-402 provides: escrow guarantee, trust scoring, dispute resolution

**Client economics:**
- Pre-deposit model eliminates payment risk for provider
- Unused time automatically refunded
- Per-minute billing (not per-hour) means clients pay for actual usage
- Trust score incentivizes reliable sessions (no early termination abuse)

**Protocol economics:**
- v1: No protocol fee. Build supply.
- v2: Optional 1-2% protocol fee on compute sessions
- Revenue accrues to ARC-402 treasury (governance TBD)

---

## What's Shared with Task-Based Delivery

| Component | Shared? | Notes |
|-----------|---------|-------|
| AgentRegistry | ✅ | GPU providers register with compute capabilities |
| TrustRegistry / VouchingRegistry | ✅ | Same trust layer |
| Workroom container | ✅ | Same sandbox, just with --gpus flag |
| Network policy / iptables | ✅ | Same governance |
| Daemon HTTP server | ✅ | New routes added to existing server |
| Worker identity (SOUL.md etc) | ✅ | GPU providers have specialised identities too |
| File delivery | ✅ | Training outputs delivered via same file layer |
| Dispute resolution | Partial | New ComputeAgreement has its own dispute logic |
| Payment | Partial | Streaming vs lump-sum — different contract |

---

*GPU compute rental is the second product surface on ARC-402. Same protocol, same trust, same governance — different lifecycle. Task-based delivery is "hire a worker." Compute rental is "rent a machine." Both need each other: the worker doing your task might need GPU compute from another provider.*

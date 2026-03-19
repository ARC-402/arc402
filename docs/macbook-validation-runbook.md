# ARC-402 MacBook Validation Runbook

Use this on a clean MacBook to prove the launch-default ARC-402 operator path without founder hand-holding.

This is not a theory doc. It is the exact validation slice for the next dress rehearsal.

---

## Objective

Prove that a clean MacBook can:

1. install the ARC-402 operator toolchain
2. initialize the OpenShell-backed governed workroom
3. start the runtime with `arc402 daemon start`
4. scaffold and verify the canonical public endpoint
5. complete the wallet / passkey approval loop

If any step fails, record the exact command, output, and broken layer.

---

## Locked architecture to validate

- ARC-402 runtime stays inside OpenShell
- public ingress stays outside the sandbox as a host-managed Cloudflare Tunnel
- sandbox outbound policy stays separate from public endpoint registration
- `https://<agentname>.arc402.xyz` is the canonical public identity

---

## Prerequisites on the MacBook

- Docker Desktop installed and running
- OpenClaw installed
- `openclaw install arc402-agent` completed
- `arc402-cli` installed and on PATH
- owner wallet available for onboarding / passkey approval
- Cloudflare account / tunnel credentials available if endpoint proof is part of the session

---

## Validation sequence

### 1. Local operator base

```bash
arc402 --version
arc402 config init
arc402 daemon init
```

Record:
- whether the CLI is immediately usable
- whether config prompts are self-explanatory
- whether machine-key / Telegram requirements are obvious

### 2. OpenShell substrate proof

```bash
arc402 openshell install
arc402 openshell init
arc402 openshell status
arc402 openshell doctor
```

Pass condition:
- `status` proves the sandbox exists, policy file exists, runtime root is known, and remote bundle is present
- `doctor` isolates any failure to Docker, OpenShell gateway, providers, sandbox, runtime sync, daemon config, or daemon boot

If blocked, capture the exact failing layer from `arc402 openshell doctor`.

### 3. Runtime launch proof

```bash
arc402 daemon start
arc402 daemon status
arc402 daemon logs
```

Pass condition:
- daemon starts through the OpenShell-owned path
- status/logs are readable without manual SSH exploration
- any secret-materialization issue is surfaced as an ARC-402 launch seam problem, not a mystery OpenShell issue

### 4. Canonical endpoint proof

```bash
arc402 endpoint init <agentname>
arc402 endpoint claim <agentname> --tunnel-target <https://...>
arc402 endpoint status
arc402 endpoint doctor
```

Pass condition:
- local endpoint config is written
- hostname claim succeeds
- status/doctor identify whether any remaining gap is DNS, tunnel, local ingress target, runtime, or AgentRegistry parity

### 5. Approval path proof

Validate from the same operator journey:
- wallet onboarding / detection
- passkey setup
- passkey-sign approval round trip

Pass condition:
- the operator can understand which steps happen on phone vs machine
- governance approvals round-trip cleanly back into the local runtime flow

---

## What to record when something fails

For every failure, capture:

- command run
- exact output
- broken layer
- whether the fix is:
  - CLI behavior
  - CLI copy / wording
  - docs / checklist
  - external operational dependency

Use these layer names consistently:
- Docker / OpenShell substrate
- ARC-402 OpenShell config
- sandbox / runtime sync
- daemon launch seam
- local ingress target
- tunnel / DNS
- AgentRegistry parity
- mobile approval flow

---

## Current known blockers before the MacBook pass

These are already known and should not be misdiagnosed as surprises:

1. **MacBook validation has not been rerun yet**
   - This runbook exists to produce that proof.
2. **Host-managed Cloudflare Tunnel still needs real proof on the clean machine**
   - endpoint status/doctor can diagnose, but the infrastructure still has to be live.
3. **AgentRegistry endpoint parity remains an explicit operator step**
   - `arc402 endpoint claim` does not yet auto-update AgentRegistry.
4. **Generated/public-surface repo churn still needs separation before publish**
   - not a machine blocker, but still a publish blocker.

---

## Exit criteria

The MacBook validation slice is complete when we have:

- one successful clean-machine OpenShell-backed runtime start
- one successful canonical endpoint proof or a sharply isolated external blocker
- one successful wallet/passkey approval loop
- a short list of remaining real blockers, with no hand-wavy ambiguity about which layer failed

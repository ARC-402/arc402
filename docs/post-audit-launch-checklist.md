# ARC-402 Launch Checklist

**Purpose:** final publish-surface checklist for the current ARC-402 launch.

This replaces the older "post-audit deploy" framing for launch operations. The protocol is already live on Base mainnet. What remains is launch polish, proof, and publish discipline.

**Locked publish order:**
1. public surfaces first
2. MacBook clean-room onboarding proof after polish
3. publish

**Do not invert this order.**

---

## 1. Public surfaces first

These are the surfaces a first public reader or operator sees before touching deeper implementation details.

### 1.1 Root positioning
- [ ] `README.md` explains ARC-402 as one product
- [ ] OpenShell is framed as underlying runtime safety infrastructure, not a second launch product
- [ ] mobile-first vs CLI-first paths are explicit
- [ ] phase 2 boundaries are explicit
- [ ] canonical install phrase is consistent: `openclaw install arc402-agent`

### 1.2 SDK / CLI / skill surfaces
- [ ] `cli/README.md` reflects the current endpoint-first operator flow
- [ ] `reference/sdk/README.md` and `python-sdk/README.md` point back to the operator path cleanly
- [ ] `skills/arc402-agent/SKILL.md` matches the launch runtime story and endpoint order
- [ ] endpoint language consistently uses `https://<agentname>.arc402.xyz`
- [ ] docs never imply that public endpoint registration automatically grants outbound sandbox trust

### 1.3 GitHub-facing docs
- [ ] `docs/getting-started.md` matches the current onboarding/runtime path
- [ ] `docs/launch-scope.md` is the truth source for what ARC-402 is / is not
- [ ] `docs/launch-readiness-prd.md` and `docs/launch-implementation-roadmap.md` still match the latest implementation state
- [ ] this checklist reflects the real launch order
- [ ] no obvious wording contradictions remain across root docs, SDK docs, and skill docs

### 1.4 Repo hygiene for public reading
- [ ] intentional docs/source changes are distinguishable from generated artifacts
- [ ] public readers are not pushed into stale reference docs first
- [ ] old pre-launch / pre-mainnet wording is removed from launch-facing surfaces

---

## 2. MacBook clean-room onboarding proof

This is the final dress rehearsal after public surfaces are polished.

### 2.1 Machine setup
- [ ] install Docker
- [ ] install OpenClaw
- [ ] install ARC-402 skill via `openclaw install arc402-agent`
- [ ] verify CLI install and config init

### 2.2 Runtime path
- [ ] run `arc402 openshell init`
- [ ] verify `arc402 openshell status`
- [ ] run `arc402 openshell doctor`
- [ ] start the governed workroom with `arc402 daemon start`
- [ ] verify status/logs without manual SSH reasoning
- [ ] follow `docs/macbook-validation-runbook.md` and capture every failing layer verbatim

### 2.3 Endpoint / registration path
- [ ] run `arc402 endpoint init <agentname>`
- [ ] run `arc402 endpoint claim <agentname> --tunnel-target <https://...>`
- [ ] verify `arc402 endpoint status`
- [ ] confirm agent registration uses the canonical endpoint

### 2.4 Approval path
- [ ] validate wallet onboarding / detection
- [ ] validate passkey setup
- [ ] validate passkey-sign approval round trip

### 2.5 Capture friction
- [ ] record every blocker, confusion point, and missing proof
- [ ] convert each real issue into doc/CLI polish before publish

---

## 3. Publish gate

Only publish once sections 1 and 2 are complete enough that the repo feels coherent to a first operator.

### 3.1 Final publish checks
- [ ] launch wording is singular and consistent: ARC-402 is the product
- [ ] README, getting started, SDK docs, and skill docs agree on setup order
- [ ] no launch-facing doc still describes ARC-402 as pre-mainnet / testnet-pending
- [ ] remaining gaps are known and clearly post-launch, not hidden launch blockers

### 3.2 Publish actions
- [ ] finalize repo polish / nav order
- [ ] confirm publish-ready diff plan
- [ ] publish only after MacBook proof is complete

---

## Remaining known blockers to clear before publish

- Clean MacBook rerun has not yet been completed.
- Endpoint health still needs full proof against the host-managed Cloudflare Tunnel default.
- Generated/runtime artifact churn still needs to stay separated from intentional publish-surface changes.
- Launch-facing docs must continue to resist drift back into older multi-product or pre-mainnet wording.

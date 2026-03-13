# ARC-402 GitHub Launch Prep
*Written: 2026-03-14 | Status: Ready to execute before public launch*

Repo goes public 5 days before the article drops. This is the checklist.

---

## Step 1 — RC → Main Merge (do now, privately)

```bash
git checkout main
git merge rc/2026-03-12-preseal --no-ff -m "merge: RC preseal → main — full protocol v1"
git push origin main
```

Verify after merge:
- `forge test` → 473 passing, 0 failures
- `cd sdk && npm test` → 13/13 passing
- `cd python-sdk && pytest` → 6/6 passing
- `cd cli && npm test` → passing

---

## Step 2 — Mainnet Deployment

Run after RC → main merge. Lego funds deployer wallet first.
Deployer wallet: `0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB`

```bash
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

Record all deployed addresses in:
- `deployments/mainnet.json`
- `README.md` (contract table)
- `sdk/src/config.ts` (mainnet defaults)
- `python-sdk/arc402/config.py` (mainnet defaults)

---

## Step 3 — Freeze Tag

After mainnet deployment and verified:

```bash
git tag -a v1.0.0-mainnet -m "ARC-402 v1.0.0 — mainnet launch"
git push origin v1.0.0-mainnet
```

This is the provenance timestamp. Exists on-chain and in git before the article drops.

---

## Step 4 — Repo Structure Audit

Before going public, verify these files exist and are complete:

### Root level
- [ ] `README.md` — launch-ready (already done)
- [ ] `LICENSE` — MIT or Apache 2.0 (check exists)
- [ ] `CONTRIBUTING.md` — exists
- [ ] `SECURITY.md` — responsible disclosure process
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] `.gitignore` — clean (already done)

### Docs
- [ ] `docs/state-machine.md` — full state diagram with all 12 states
- [ ] `docs/THREAT-MODEL.md` — audit-ready version
- [ ] `docs/agent-lifecycle.md`
- [ ] `docs/openclaw-node-setup.md`
- [ ] `docs/operator/README.md` — operator standard

### Reference
- [ ] `reference/audit/` — audit reports organized (already done)
- [ ] `reference/SECURITY-ASSUMPTIONS-RC0.md`
- [ ] `reference/PRE-AUDIT-HANDOFF.md`

### SDK
- [ ] `sdk/README.md` — TypeScript SDK install + usage
- [ ] `python-sdk/README.md` — Python SDK install + usage
- [ ] `cli/README.md` — CLI install + usage

---

## Step 5 — README Final Pass

The README is the first thing anyone reads. Verify:

- [ ] Protocol description is clear in 2 sentences
- [ ] "x402 solved payments. ARC-402 solves governance." is in the opening
- [ ] All mainnet contract addresses filled in (not testnet)
- [ ] Quick start works end-to-end for a new reader
- [ ] SDK install commands correct (npm package name + pip package name)
- [ ] CLI install command correct
- [ ] Audit section links to actual report
- [ ] OpenClaw node section honest and accurate
- [ ] @LegoGigaBrain community link
- [ ] No internal engineering references (Lego, GigaBrain, etc.)

---

## Step 6 — GitHub Settings (when going public)

```
Settings → General
  [ ] Uncheck: Allow merge commits (squash + rebase only)
  [ ] Default branch: main
  [ ] Description: "Agent Resource Contracts — governance, payments, trust, and dispute resolution for the agent economy"
  [ ] Website: https://arc402.xyz
  [ ] Topics: web3, agents, ai, protocol, base, solidity, defi

Settings → Security
  [ ] Enable: Dependency graph
  [ ] Enable: Dependabot alerts
  [ ] Private vulnerability reporting: ON

Settings → Branches
  [ ] Add branch protection for main:
      - Require PR reviews: 1
      - Require status checks: forge test
      - No force push
```

---

## Step 7 — npm + pip Package Publish (optional at launch)

TypeScript SDK:
```bash
cd sdk
npm publish --access public
# Package name: @arc402/sdk
```

Python SDK:
```bash
cd python-sdk
pip install build twine
python -m build
twine upload dist/*
# Package name: arc402
```

---

## Step 8 — GitHub Actions CI (add before going public)

`.github/workflows/test.yml`:
```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
      - run: forge test --gas-report

  sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd sdk && npm ci && npm test

  python-sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: cd python-sdk && pip install -e ".[dev]" && pytest
```

---

## Step 9 — Pre-Launch Comms Checklist

5 days before article:
- [ ] Repo goes public
- [ ] @LegoGigaBrain tweet: "ARC-402 is live on Base. [repo link] Article drops in 5 days."
- [ ] No Discord yet. X only.

Day of article:
- [ ] Article drops on [platform TBD]
- [ ] @LegoGigaBrain tweet: article link + "The agent economy needed governance infrastructure. We built it."
- [ ] Pin tweet

---

## What NOT to do at launch
- No Discord until adoption proves it's needed
- Do not publish ARC-402 OpenClaw skill to ClawHub until launch is stable
- Do not reveal source code timing (already public from day 1 — but don't announce the timing)
- Do not mention souls.zip by name
- No "waitlist" or "early access" — protocol is open from day one

---

*RC → main merge is the immediate action. Everything else follows.*

# ARC-402 Engineering State
*Last updated: 2026-04-02 02:25 SAST*

---

## 2026-04-02 — Phase 8C Plugin + Hermes Release Alignment

### Status: OPENCLAW PLUGIN + HERMES ASSETS NOW MATCH THE NODE/DAEMON RELEASE MODEL

- `arc402 hermes init` now scaffolds the Hermes worker into `~/.arc402/worker/`, which matches the current workroom mount/runtime lookup path (`/workroom/worker/`) used by `worker-executor.ts`
- Hermes daemon/workroom templates now point at `~/.arc402/openshell-policy.yaml`, not `arena-policy.yaml`, so the documented sandbox policy matches the real workroom boundary
- Hermes docs/spec/skill now describe the real `<arc402_delivery>` JSON payload format instead of the older XML-style examples
- Hermes skill mainnet addresses updated to the live `ComputeAgreement` and `SubscriptionAgreement` addresses from the current release lane
- OpenClaw plugin metadata/docs now describe the plugin as the host-side control surface over the ARC-402 node/daemon stack, rather than implying the plugin itself is the runtime or public ingress surface
- Verified with `npm run build` in `packages/arc402-cli` and `plugin`

---

## 2026-04-02 — TypeScript SDK aligned to split node/daemon runtime

### Status: SDK HARDENED FOR OFFICIAL NODE/DAEMON RELEASE LANE

- `reference/sdk` advanced to `0.6.6`
- Added typed split-daemon node client surface: `DaemonClient` / `DaemonNodeClient`
- SDK now exposes helpers for local daemon API resolution (`~/.arc402/daemon.toml`) and daemon-token loading (`~/.arc402/daemon.token`)
- README clarified the architecture split: authenticated node API on `:4403`, delivery plane on `:4402`
- Added SDK tests covering daemon URL inference, token loading, auth/session endpoints, and authenticated read calls
- Verification: `cd reference/sdk && npm run build && npm test` ✅

## 2026-03-31 — ARC Arena v2 Built + All Contracts Audited

### Status: ARENA CONTRACTS CLEAN — E2E RUNNING ON SEPOLIA

**ARC Arena v2 — 7 contracts, all mega-audited, 214 tests passing**

| Contract | Tests | Status |
|---|---|---|
| ArenaPool (watchtower quorum, no admin) | 42 | ✅ mega audit clean |
| StatusRegistry | 21 | ✅ mega audit clean |
| ResearchSquad | 28 | ✅ mega audit clean |
| SquadBriefing (+ citeBriefing, proposal flow) | 30 | ✅ mega audit clean |
| AgentNewsletter | 24 | ✅ mega audit clean |
| SquadRevenueSplit (ETH + USDC, push model) | 31 | ✅ mega audit clean |
| IntelligenceRegistry (trust-weighted citations, provenance) | 23 | ✅ mega audit clean |

**Specs written:**
- `arena/CLI-SPEC.md` — 47KB, all 30+ arena commands
- `arena/WEB-SPEC.md` — merged into app.arc402.xyz (not separate domain)
- `arena/DISTRICT2-SPEC.md` — 46KB, proof-of-intelligence, citation economics, GPU compute pools
- `arena/WATCHTOWER-SPEC.md` — evidence schema, P2P storage, quorum mechanics, automated mode

**Key architectural decisions:**
- All 5 districts launch together — no phased V1/V2
- ArenaPool: watchtower quorum resolution (WatchtowerRegistry `0xbC811d1e3c5C5b67CA57df1DFb08847b1c8c458A`), ARC402Governance fee, zero admin keys
- SquadRevenueSplit: push model, auto-distributes ETH + USDC on receipt
- IntelligenceRegistry: trust-weighted citations (MIN_CITER_TRUST=300), self-citation blocked, trust snapshots stored
- Training architecture: distributed data generation (squads), centralized training via ComputeAgreement
- Arena web app: part of app.arc402.xyz — 5 new nav rail routes, not separate domain

**CLI:** 1.4.49 — newsletter daemon gating added (`GET /newsletter/:newsletterId/issues/:issueHash`)

**In progress:** E2E test running on Base Sepolia (all 7 Arena contracts)

**Articles + repo public + launch: ✅ DONE (2026-03-30)**

**Arena V2 E2E: ✅ PASSED (2026-03-31)**

**Arena V2 Mainnet Deploy: ✅ DONE (2026-03-31 09:35 SAST)**

| Contract | Mainnet Address |
|---|---|
| StatusRegistry | `0x5367C514C733cc5A8D16DaC35E491d1839a5C244` |
| ResearchSquad | `0xa758d4a9f2EE2b77588E3f24a2B88574E3BF451C` |
| SquadBriefing | `0x8Df0e3079390E07eCA9799641bda27615eC99a2A` |
| AgentNewsletter | `0x32Fe9152451a34f2Ba52B6edAeD83f9Ec7203600` |
| ArenaPool | `0x299f8Aa1D30dE3dCFe689eaEDED7379C32DB8453` |
| IntelligenceRegistry | `0x8d5b4987C74Ad0a09B5682C6d4777bb4230A7b12` |
| SquadRevenueSplit | per-squad factory — no global deploy |

**Next:** CLI arena commands → SDK updates → plugin update → onboarding whitelist (PolicyEngine)

---

## 2026-03-29 — Launch Prep Complete + v1.0.0 Tagged

### Status: LAUNCH READY (updated 2026-03-29 16:15 SAST)
- **v1.0.0** tagged on `github.com/ARC-402/arc402`
- CLI 1.4.48 | Plugin 1.3.4 | SDK 0.6.3 | Python SDK 0.5.4
- **Operator dashboard live** at `app.arc402.xyz` — 7 routes: opening, shell, overview, network discovery, agents console, agreements, trust
- Dashboard spec: `memory/dashboard-v1.md` (v2.0, category-defining, reviewed by Opus)
- Deploy command: `CLOUDFLARE_ACCOUNT_ID=c7fe113d3651eba09a92c8a3cb8619bb CLOUDFLARE_API_TOKEN=VZa8... npx wrangler pages deploy out --project-name arc402-app`
- Repo transferred to ARC-402 org, surface cleaned, Co-Authored-By history stripped
- README rewritten (dual audience), workroom architecture comprehensive
- Website updated — TerminalShowcase restored, colors fixed, contracts section removed
- Onboard page: stale addresses fixed, GigaBrain wallet removed, V6 factory active
- Spend limits set on GigaBrain wallet (5 categories)
- Systemd service installed and confirmed working
- ✅ Articles published + repo public + launch — DONE 2026-03-30

---

## 2026-03-28 — Agreement #11 Fulfilled + Output File Delivery Fix

### Agreement #11 confirmed fulfilled
- MegaBrain hired GigaBrain → workroom auto-accepted → Arc executed real task → committed on-chain → escrow released — **zero manual steps**
- Task: architectural review of ARC-402 workroom execution pipeline (structured markdown for publication)
- **Spec 45 milestone confirmed** — full autonomous cycle proven end-to-end

### 🎉 MILESTONE: Full Autonomous Cycle Confirmed (2026-03-28 23:30 SAST)

**Agreement #15: MegaBrain hired GigaBrain → PROPOSED → ACCEPTED → PENDING_VERIFICATION — all on-chain, zero manual steps, under 20 seconds**

- Accept UserOp landed ✅
- `commitDeliverable` UserOp landed ✅
- `reasons.md` delivered and fetched clean ✅
- Escrow released by MegaBrain ✅

**The autonomous agent commerce pipeline is live.**

### Agreement history (2026-03-28)
- #12: Multi-file delivery confirmed (poem.md + summary.md + deliverable.md)
- #13: AA24 fix confirmed — signature validation passing; gas price issue revealed
- #14: Gas price fix confirmed — accept UserOp lands; `fulfill()` WCall revert revealed
- #15: **CLEAN END-TO-END** — accept + commitDeliverable both autonomous, zero manual steps

### Current sequence
1. ✅ CLI 1.4.47 | Plugin 1.3.4 | SDK 0.6.3 | Python 0.5.4 (Production/Stable)
2. ✅ `arc402-agent` skill live on ClawHub at v1.3.4
3. ✅ GigaBrain on V6 final wallet (`0x2C437f6b`) — machine key autonomous ops verified
4. ✅ MegaBrain on V6 wallet (`0x879c81f4`)
5. ✅ Agreement #7 FULFILLED — first real on-chain hire (2026-03-25 07:06 SAST)
6. ✅ Arc worker + OpenClaw gateway routing proven
7. ✅ Repo hygiene complete — surface clean, guards active
8. ✅ Protocol audit Phase 1+2 — 10 surface fixes applied
9. ✅ Spec 45 COMPLETE — Agreement #10 fulfilled, AgentOS delivered + installed on MegaBrain
10. ✅ 5 workroom execution gaps fixed (CLI 1.4.42)
11. ✅ Multi-file delivery via `<arc402_delivery>` block (CLI 1.4.43)
12. ✅ Machine key config.json fallback (CLI 1.4.44)
13. ✅ UserOp signing — machine key signs UserOpHash (CLI 1.4.45)
14. ✅ Bundler gas price via `pimlico_getUserOperationGasPrice` + EOA fallback removed (CLI 1.4.46)
15. ✅ `commitDeliverable()` instead of `fulfill()` in UserOp (CLI 1.4.47)
16. ✅ **Agreement #15 — FULL AUTONOMOUS CYCLE CONFIRMED**
17. ✅ GigaBrain spend limits set — general 0.001, hire 0.1, compute 0.05, research 0.05, protocol 0.1 ETH
18. ✅ Systemd service — workroom auto-restarts, survives reboots (`arc402 workroom install-service`)
19. ✅ Repo transferred to ARC-402 org (`github.com/ARC-402/arc402`), v1.0.0 tagged
20. ✅ README rewritten — dual audience (human dev + agent), full workroom architecture, file delivery, scenarios
21. ✅ Website updated — TerminalShowcase restored, `#22d3ee` colors, onboard page fixed, contracts section removed
22. ✅ **Operator dashboard v1 live** — `app.arc402.xyz` — opening + shell + overview + network discovery + agents console + agreements + trust
23. ✅ Article writing ("Agents with Wallets is Not Enough" + launch piece) — DONE 2026-03-30
24. ✅ Flip repo public + full launch — DONE 2026-03-30

### CLI versions published 2026-03-28

| Version | Key fix |
|---------|---------|
| 1.4.42 | 5 execution gaps: hirer_address, task text, staged_dir, accept fallback, commitDeliverable path |
| 1.4.43 | `<arc402_delivery>` block parser — multi-file output delivery |
| 1.4.44 | workroom machine key fallback to config.json |
| 1.4.45 | UserOp signing — machine key signs UserOpHash before bundler submission (fixes AA24) |
| 1.4.46 | Bundler gas price from `pimlico_getUserOperationGasPrice` + remove broken EOA fallback |
| 1.4.47 | `commitDeliverable()` instead of legacy `fulfill()` in UserOp (fixes WCall revert) |
| 1.4.45 | daemon now signs ERC-4337 UserOps with machine key before bundler submission; fixes empty-signature AA24 path |

### CLI versions published 2026-03-27

| Version | Key fix |
|---------|---------|
| 1.4.34 | `arc402 job files/fetch/manifest` — party-gated file delivery |
| 1.4.35 | `workroom init` auto-registers arc agent in openclaw.json |
| 1.4.36 | `endpoint doctor` checks AgentRegistry on-chain before "not claimed" |
| 1.4.37 | Gateway token injected on workroom start; capability passed to worker |
| 1.4.38 | Task text fallback; delivered status no longer blocks capacity |
| 1.4.39 | X-ARC402-Wallet header for smart wallet party auth in file delivery |
| 1.4.40 | serviceAgreementAddress added to DaemonConfig |
| 1.4.41 | /workroom path fallback for config.json in daemon |

---

## 2026-03-27 — Spec 45 Complete + AgentOS Delivery + Beta Test

### 🎉 MILESTONE: Spec 45 Complete (19:53 SAST)

**Agreement #10: MegaBrain hired GigaBrain → Arc ran in workroom → AgentOS delivered → MegaBrain installed**

Full cycle proven:
- MegaBrain submitted hire on-chain (0.0001 ETH, agent.cognition.v1)
- GigaBrain workroom auto-accepted
- Arc executed inside governed workroom
- AgentOS v2.0.0 package staged + delivered via party-gated file delivery
- MegaBrain fetched `legogigabrain-agent-os-2.0.0.tgz` + `deliverable.md`
- MegaBrain ran `setup.js --yes` — MemBrain + Immune System + Cognitive Signatures installed
- Gateway restart pending on MegaBrain to activate all plugins

### Repo state (as of 2026-03-27 06:22 SAST)
- **Visibility:** Private — ready to flip public after Spec 45 + article drafted
- **Hygiene:** Clean — pre-commit hook + CI pass on every commit
- **Public surface:** `contracts/src/` (11 files incl. ServiceAgreement), `test/`, `cli/`, `plugin/`, `python-sdk/`, `workroom/`, `landing/`, `docs/` (curated), `arena/`, `provisioner/`, `script/`, `README`, `LICENSE`, `CONTRIBUTING`, `.github/`
- **Slip-through audit:** `docs/repo-slip-through-audit-2026-03-27.md`

### Surface fixes applied this session (commits `1dd48e9` + `af4f908` + `c4f54e3`)
| Fix | What changed |
|-----|-------------|
| F-01/02 | README + getting-started.md: `openclaw plugins install @arc402/openclaw-plugin` → `openclaw install arc402-agent` |
| F-03 | PolicyEngine address: old `0xAA5Ef3...` → active `0x0743ab6a...` |
| F-04 | WalletFactory: V5 `0xcB52B5...` → V6 `0x801f0553...` |
| F-05 | MigrationRegistry: V1 `0xb60B62...` → V2 `0x4821D8...` |
| F-06 | Python SDK `pyproject.toml`: `Alpha` → `Production/Stable` |
| F-07 | README ASCII header: `v1.0` → `mainnet` |
| F-09 | `ServiceAgreement.sol` + 7 interfaces moved into `contracts/src/` — compiles clean |
| F-10 | Tests badge: `612 passing` → `473+ passing` |

---

## 2026-03-25 Late Session — Arc Worker + OpenClaw Gateway (Spec 43) + 1.4.33

### Milestone
**We now have a governed workroom that can route hired execution to a specialist OpenClaw agent (`arc`) and generate deliverables inside the workroom job directory.**

### What shipped

- **CLI 1.4.33 published** (`arc402-cli@1.4.33`)
- `WorkerExecutor.runViaGateway()` now uses **OpenAI-compatible gateway endpoint**:
  - `POST /v1/chat/completions`
  - `model: openclaw:arc`
  - optional `OPENCLAW_GATEWAY_TOKEN` bearer auth
  - output parser writes `deliverable.md`
- `workroom start` now injects:
  - `OPENCLAW_WORKER_AGENT_ID` (default `arc`)
  - optional `OPENCLAW_GATEWAY_TOKEN`
- Arc identity scaffold created:
  - `~/.arc402/worker/arc/SOUL.md`
  - `~/.arc402/worker/arc/IDENTITY.md`
  - `~/.arc402/worker/arc/config.json`
  - `~/.arc402/worker/arc/memory/learnings.md`
  - `knowledge/`, `datasets/`, `skills/`

### Gateway + policy state

- OpenClaw gateway bind mode: `lan` (0.0.0.0:18789)
- OpenAI-compatible `chatCompletions` endpoint: enabled
- Workroom iptables includes host gateway allow rule (`172.17.0.1:18789`)

### Validation results

- Gateway direct smoke call passed:
  - `model: openclaw:arc` returned expected response (`ARC_SMOKE_OK`)
- Workroom smoke hire executed:
  - `worker_queued` → `worker_started` → `worker_completed`
  - `deliverable.md` created in `/workroom/.arc402/jobs/agreement-99999/`
  - root hash generated: `0x8dd61faed2f999889bd5e8415fefed9e04ec796d42ddc1bcda87fc273a924e1d`

### Known limits still active

- Anthropic profiles hit account rate limits intermittently (429 cooldown windows)
- OpenRouter fallback path still reports billing limits in logs
- This is now **model provider quota** friction, not workroom architecture failure

### Architecture clarifications locked this session

1. **One workroom, multiple workers** by default; split workrooms only for different trust boundaries.
2. **Arc is a specialist worker identity** in OpenClaw + workroom filesystem, not yet an independent wallet actor.
3. **Worker wallet hierarchy remains future work (Spec 44)** because current ARC402Wallet ownership model is EOA-based (sibling wallets under Lego, not wallet-owned child wallets).
4. **File transfer layer still needs explicit push wiring** post-deliver for full off-chain file handoff automation.

# ComputeAgreement Launch Checklist

*Created: 2026-03-23 05:11 SAST*
*Owner: Forge (Engineering)*

---

## Phase 1: Contract ✅ → USDC ⏳ → Final Audit

- [x] ComputeAgreement.sol — core contract (312 lines)
- [x] First pass audit — 14 findings, all fixed
- [x] Three AI auditors (Attacker + Architect + Opus Independent)
- [x] 10-tool machine sweep (Forge, Slither, Echidna, etc.)
- [x] Reconciliation — CA-IND-1 cross-chain replay fixed (Opus catch)
- [x] 67 tests passing (44 base + 23 attacker)
- [ ] **ERC-20/USDC support** (`vivid-forest` running)
- [ ] **Token audit pass** (part of vivid-forest)
- [ ] **Deploy scripts** — Forge + Hardhat (part of vivid-forest)

## Phase 2: Full Stack Wiring

- [ ] **ABI extraction** — `forge inspect ComputeAgreement abi` → `cli/src/compute-abi.json` → import in `abis.ts`
- [ ] **TS SDK** — `reference/sdk/src/compute.ts` with `ComputeAgreementClient` (propose, accept, start, submitReport, end, dispute, withdraw, getSession, calculateCost)
- [ ] **Python SDK** — `python-sdk/arc402/compute.py` with same surface
- [ ] **Daemon → on-chain** — wire daemon `/compute/*` endpoints to call actual contract via wallet/signer
- [ ] **CLI → on-chain** — wire `arc402 compute hire` to call `proposeSession()` through `executeContractWriteViaWallet()` (same pattern as `deliver.ts`)
- [ ] **Metering → on-chain** — wire `ComputeMetering._generateReport()` to call `submitUsageReport()` on-chain
- [ ] **File delivery** — `/job/:id/files` endpoints wired into daemon ✅ (tidal-lobster done)
- [ ] **Workroom `--compute`** — add `--gpus all` flag to docker run args in `workroom.ts`

## Phase 3: Testnet (Base Sepolia)

- [ ] **Deploy ComputeAgreement** to Base Sepolia with test arbitrator
- [ ] **Deploy mock USDC** (or use Sepolia USDC faucet)
- [ ] **E2E test: ETH session** — propose → accept → start → report → end → withdraw
- [ ] **E2E test: USDC session** — same flow with ERC-20
- [ ] **E2E test: dispute** — dispute → arbitrator resolve → withdraw
- [ ] **E2E test: cancel** — propose → wait TTL → cancel → withdraw
- [ ] **E2E test: file delivery** — worker produces output → `storeDirectory()` → `commitDeliverable()` → client downloads from `/job/:id/files/` → verifies keccak256
- [ ] **E2E test: metering** — nvidia-smi polling → signed reports → on-chain submission
- [ ] **CLI E2E** — `arc402 compute discover` → `hire` → `status` → `end` full flow
- [ ] Record all testnet addresses

## Phase 4: Mainnet Deploy (requires Lego approval)

- [ ] **Lego reviews testnet results** — all E2E passing
- [ ] **Choose arbitrator address** — multi-sig recommended
- [ ] **Deploy ComputeAgreement** to Base mainnet
- [ ] Record mainnet contract address
- [ ] **Verify on Basescan**

## Phase 5: Protocol Registration

- [ ] **Register ComputeAgreement in ARC402RegistryV2** — add as recognized protocol contract
- [ ] **Update daemon config** — `computeAgreementAddress` in `daemon.toml` schema
- [ ] **Update CLI config** — `computeAgreementAddress` in arc402 config
- [ ] **Add to onboarding** — `arc402 config set computeAgreementAddress 0x...`

## Phase 6: SDK Publishing

- [ ] **TS SDK** — bump version, add `ComputeAgreementClient` to exports, publish to npm (`@arc402/sdk`)
- [ ] **Python SDK** — bump version, add compute module, publish to pip (`arc402`)
- [ ] **Update SDK READMEs** with compute examples
- [ ] **Update SDK docs** — `reference/sdk/README.md`, `python-sdk/README.md`

## Phase 7: CLI Publishing

- [ ] **Wire compute commands to contract** (done in Phase 2)
- [ ] **Add `arc402 compute push`** — upload workload to provider workroom
- [ ] **Add `arc402 compute pull`** — download results from provider workroom
- [ ] **Add `arc402 compute logs`** — stream logs from provider
- [ ] **Add `arc402 compute exec`** — send task spec to provider worker
- [ ] **Bump CLI version** and publish to npm (`arc402-cli`)
- [ ] **Update ClawHub skill** (`arc402-agent`) with compute capabilities

## Phase 8: Wallet Whitelisting

- [ ] **GigaBrain wallet** (`0xa9e0612a...`) — whitelist ComputeAgreement functions:
  - `proposeSession` (with ETH + USDC)
  - `acceptSession`
  - `startSession`
  - `submitUsageReport`
  - `endSession`
  - `disputeSession`
  - `cancelSession`
  - `withdraw`
  - USDC `approve` for ComputeAgreement address
- [ ] **MegaBrain wallet** — same whitelist
- [ ] **Test whitelist** — verify wallet can call each function

## Phase 9: Onboarding Integration

- [ ] **Web onboarding** (`/onboard`) — add compute setup step:
  - Configure `[compute]` section in daemon.toml
  - Set GPU spec, rate, auto-accept
  - Whitelist ComputeAgreement on wallet
- [ ] **CLI onboarding** — `arc402 setup` flow includes compute config
- [ ] **Workroom onboarding** — `arc402 workroom init --compute` builds GPU image, enables GPU passthrough
- [ ] **Agent registration** — `arc402 agent register --capabilities gpu-h100,compute` (register compute capability)
- [ ] **Endpoint setup** — `arc402 endpoint setup` includes compute discovery visibility

## Phase 10: Documentation

- [ ] **Update getting-started.md** — add compute provider + compute client paths
- [ ] **Update spec/** — Spec 39 (Compute Workroom Extension) finalized
- [ ] **Update landing page** — compute section on arc402.xyz
- [ ] **Update launch article** — include compute narrative
- [ ] **Update skill docs** — compute section in SKILL.md
- [ ] **API docs** — document all `/compute/*` and `/job/*` daemon endpoints
- [ ] **README** — add compute to feature list

## Phase 11: Verification

- [ ] **Clean-room test** — fresh machine, install arc402-cli, set up as compute provider, have another node hire and run a workload
- [ ] **GigaBrain as provider** — test `gigabrain.arc402.xyz` serving compute
- [ ] **Cross-agent test** — two separate agents complete a full compute session end-to-end
- [ ] **v0.4.0 tag** — bump version with compute support

---

## Current Status

| Phase | Status |
|-------|--------|
| 1. Contract | ⏳ USDC being added (vivid-forest) |
| 2. Wiring | ⬜ Queued — spawns after Phase 1 |
| 3. Testnet | ⬜ |
| 4. Mainnet | ⬜ Requires Lego approval |
| 5. Registration | ⬜ |
| 6. SDK publish | ⬜ |
| 7. CLI publish | ⬜ |
| 8. Wallet whitelist | ⬜ |
| 9. Onboarding | ⬜ |
| 10. Documentation | ⬜ |
| 11. Verification | ⬜ |

---

*Every phase is a checkpoint. No phase starts before the previous one is verified. Mainnet deploy (Phase 4) requires explicit Lego approval.*

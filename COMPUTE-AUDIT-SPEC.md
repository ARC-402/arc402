# ComputeAgreement Mega Audit + Integration Spec

## Scope

**Contract:** `contracts/src/ComputeAgreement.sol` (312 lines)
**Tests:** `test/ComputeAgreement.t.sol` (existing — 20 tests, lifecycle + sigs + settlement)
**Off-chain:** `cli/src/daemon/compute-metering.ts`, `cli/src/commands/compute.ts`

---

## Phase 1: Mega Audit (ComputeAgreement.sol)

Run the full audit protocol from `systems/smart-contract-infra/AUDIT-PROTOCOL.md`.

### Known Attack Surface (pre-audit notes)

1. **Reentrancy in `endSession`** — two ETH transfers (provider then client) with state update before. Classic pattern. Verify CEI compliance.
2. **Signature replay** — provider signs usage reports. Can the same report be submitted twice? `consumedMinutes` accumulates but no nonce/dedup on reports.
3. **Overflow in `calculateCost`** — `consumedMinutes * ratePerHour` could overflow if extreme values. Solidity 0.8 checked math helps but verify edge cases.
4. **Provider can inflate `computeMinutes`** — provider submits reports AND is the signer. Self-attestation. No client co-sign or oracle. Design tradeoff — document risk.
5. **No timeout/expiry** — a Proposed session can sit forever locking no funds (deposit is held). An Active session with no endSession call locks deposit indefinitely.
6. **Disputed sessions have no resolution path** — once disputed, funds are locked forever. No arbitration function to resolve.
7. **`startSession` vs `acceptSession` split** — why two steps? Can provider accept but never start, locking client deposit?
8. **`Paused` status exists in enum but no function transitions to it** — dead state.
9. **ETH transfer failure** — if provider is a contract that reverts on receive, client refund also fails (sequential transfers). Provider griefing vector.
10. **No access control on who calls `submitUsageReport`** — anyone can call it as long as signature is valid. Provider key leak = anyone can submit.

### Tooling

Run in order:
1. `forge test` — existing tests must pass
2. `slither contracts/src/ComputeAgreement.sol` — static analysis
3. Manual line-by-line review following AUDIT-PROTOCOL.md checklist
4. Write additional attack tests (fuzz + explicit exploit scenarios)

### Findings Format

```
ID: CA-{N}
Severity: CRITICAL | HIGH | MEDIUM | LOW | INFO
Title: ...
Location: ComputeAgreement.sol L{nn}
Description: ...
Recommendation: ...
Status: OPEN | FIXED | ACKNOWLEDGED
```

---

## Phase 2: Fix All Findings

Fix every CRITICAL and HIGH. Document MEDIUM/LOW decisions.

---

## Phase 3: Comprehensive Test Suite

Extend `test/ComputeAgreement.t.sol` with:
- Reentrancy attack test (malicious provider/client contract)
- Signature replay test
- Multiple usage reports accumulation
- Edge: zero-hour session
- Edge: exact deposit match vs overpayment
- Fuzz: random computeMinutes/ratePerHour combinations
- Dispute then attempt end/report
- Double start attempt
- Session with provider = client (self-dealing)

All tests must pass: `forge test --match-contract ComputeAgreementTest -vv`

---

## Phase 4: Testnet Deploy (Base Sepolia)

Deploy ComputeAgreement to Base Sepolia. Record address.

---

## Phase 5: NOT in scope for this session

The following are planned but NOT to be executed yet:
- Mainnet deploy
- Registry integration
- SDK updates
- CLI wiring
- Wallet whitelisting
- Onboarding flow updates

These require checkpoints with Lego first.

---

## Deliverables

1. `AUDIT-REPORT-COMPUTE-2026-03-23.md` — full findings
2. Fixed `ComputeAgreement.sol`
3. Extended `ComputeAgreement.t.sol` with attack tests
4. All forge tests green
5. Base Sepolia deployment address (if audit passes)

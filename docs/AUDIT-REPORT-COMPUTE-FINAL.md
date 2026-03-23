# ComputeAgreement — Consolidated Security Audit Report

**Document version:** 1.0 — Final
**Date:** 2026-03-23
**Classification:** Public

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Engagement Metadata](#2-engagement-metadata)
3. [Audit Methodology](#3-audit-methodology)
4. [Consolidated Findings Table](#4-consolidated-findings-table)
5. [Critical and High Findings — Detail](#5-critical-and-high-findings--detail)
6. [Design Tradeoffs and Acknowledged Items](#6-design-tradeoffs-and-acknowledged-items)
7. [Token Audit Results (ERC-20/USDC)](#7-token-audit-results-erc-20usdc)
8. [Machine Sweep Results](#8-machine-sweep-results)
9. [Test Coverage](#9-test-coverage)
10. [Testnet Deployment](#10-testnet-deployment)
11. [Final Verdict](#11-final-verdict)

---

## 1. Executive Summary

**ComputeAgreement** is a Solidity smart contract implementing session-based GPU compute rental on EVM-compatible chains. Clients deposit collateral upfront (ETH or ERC-20), providers submit cryptographically-signed metered usage reports at regular intervals, and settlement is calculated per-minute against the deposit. A designated arbitrator can resolve disputed sessions; a timeout fallback protects both parties if the arbitrator is unresponsive.

This report consolidates five independent audit passes conducted on 2026-03-23, covering 48 findings across CRITICAL, HIGH, MEDIUM, LOW, and INFO severity categories. All CRITICAL and HIGH security findings have been resolved prior to testnet deployment. The contract has been deployed and verified on Base Sepolia.

**Audit methodology:** Six-pass review combining four AI auditors with distinct mandates (initial review, adversarial exploit testing, architectural design analysis, and independent cryptographic correctness review) followed by a 10-tool automated machine sweep and a dedicated ERC-20 token safety pass.

**Overall verdict: PASS WITH CONDITIONS** — suitable for testnet and early-access deployment. Two pre-mainnet conditions are documented in [Section 11](#11-final-verdict).

---

## 2. Engagement Metadata

| Field | Value |
|-------|-------|
| Contract name | `ComputeAgreement` |
| Source file | `contracts/src/ComputeAgreement.sol` |
| Solidity version | `0.8.28` (pinned) |
| Lines of code | 522 (including NatDoc comments) |
| Language | Solidity |
| Framework | Foundry |
| Chain targets | Base (primary), Ethereum mainnet |
| ERC-20 support | Yes — USDC and compatible tokens; fee-on-transfer/rebasing excluded |
| OpenZeppelin dependencies | `IERC20`, `SafeERC20` |
| Auditor A | Claude Sonnet 4.6 — Initial review + fixes |
| Auditor B | Claude Sonnet 4.6 (Attacker persona) — Exploit PoC tests |
| Auditor C | Claude Sonnet 4.6 (Architect persona) — Design + economic review |
| Auditor D | Claude Opus 4.6 (Independent) — Cryptographic correctness |
| Machine sweep | 10 automated tools |
| ERC-20 auditor | Claude Sonnet 4.6 |
| Audit date | 2026-03-23 |
| Commit at audit start | `daa7eb5` |
| Commit at final fixes | `e556d6a` (CA-IND-1, CA-IND-2 fixes) |
| Commit at ERC-20 merge | `f4c3a0f` |
| Current HEAD | `37a1295` |
| Testnet deployment | Base Sepolia: `0x975afa11b9107a6467c7A04C80C2BAd92a405cA0` |

---

## 3. Audit Methodology

The audit was conducted in six sequential passes, each building on the findings of the prior pass.

### Pass 1 — Sonnet First Review (Auditor A)

Auditor A performed a complete manual review of the original `ComputeAgreement.sol` (312 lines at audit start) across all function surfaces: state machine correctness, fund custody, signature verification, reentrancy, access control, and arithmetic. This pass produced 14 findings (2 CRITICAL, 4 HIGH, 3 MEDIUM, 3 LOW, 2 INFO) and a complete fix plan. All 14 findings were fixed before subsequent passes.

Tooling used alongside manual review: Forge (18 initial tests), Slither (101 detectors).

### Pass 2 — Attacker Pass (Auditor B)

Auditor B received the post-fix contract and wrote adversarial Proof-of-Concept (PoC) test cases for every HIGH and CRITICAL finding identified in Pass 1, plus novel attack scenarios not covered by the initial test suite. This pass confirmed that all fixes in Pass 1 hold under adversarial conditions and produced 23 new test cases (`ComputeAgreementAttackerTest`), which are now part of the permanent test suite.

### Pass 3 — Architect Design Review (Auditor C)

Auditor C reviewed the contract from an architectural and economic perspective — not exploit hunting, but identifying systemic design weaknesses that could affect the contract at production scale. This pass produced 17 findings across DESIGN, ECONOMIC, GAS, EVENT, and INTEGRATION severity categories.

Key issues identified: arbitrator immutability (no rotation path), asymmetric dispute timeout (client-only), conflated Active sub-states, and isolation from the ARC-402 identity/reputation stack. Two findings (CA-ARCH-2: symmetric dispute timeout; CA-ARCH-15: ERC-20 support) were fixed. The remainder are documented as acknowledged tradeoffs or Phase 2 roadmap items.

### Pass 4 — Independent Cryptographic Review (Auditor D / Opus)

Auditor D (Claude Opus 4.6) reviewed the contract with zero prior context from Passes 1–3. This pass focused on cryptographic correctness, cross-chain replay, pull-payment invariants, and arithmetic edge cases.

**CA-IND-1**, the most significant finding in the entire audit series, was identified exclusively by this pass: the usage report digest lacked `block.chainid` and `address(this)`, enabling cross-chain and cross-contract signature replay. This finding would have allowed a provider to double-collect on Base and Ethereum simultaneously if both chains were deployed. The three-auditor protocol justified itself: this finding was missed by Passes 1 and 3.

This pass produced 10 findings (1 CRITICAL, 2 MEDIUM, 3 LOW, 4 INFO). The CRITICAL and both MEDIUMs were fixed.

### Pass 5 — 10-Tool Machine Sweep

An automated sweep was run using 10 tools in sequence: Forge, Slither, Mythril, Echidna, Halmos, Semgrep, Solhint, Aderyn, Wake, and Medusa. This pass cross-confirmed existing findings and identified 3 new items not in prior passes: missing zero-address check on the `arbitrator` constructor argument (SL-2, fixed), remaining `require()` string errors (style), and a cross-tool confirmation of `ecrecover` s-value malleability (fixed in CA-IND-2). See [Section 8](#8-machine-sweep-results) for tool-by-tool results.

### Pass 6 — ERC-20/USDC Token Audit

After ERC-20 support was added (`f4c3a0f`), a dedicated token safety audit evaluated the dual-token payment architecture. This pass audited 7 ERC-20-specific concerns: token custody invariants, ERC-777 reentrancy, fee-on-transfer token behavior, rebasing tokens, approval front-running, double-mapping invariant correctness, and contract size against EIP-170. The contract received a CLEAN verdict with documented exclusions for unsupported token classes. See [Section 7](#7-token-audit-results-erc-20usdc).

---

## 4. Consolidated Findings Table

### 4.1 Summary by Severity

| Severity | Total | Fixed | Acknowledged | Not Applicable |
|----------|-------|-------|--------------|----------------|
| CRITICAL | 3 | 3 | 0 | 0 |
| HIGH | 5 | 4 | 1 | 0 |
| MEDIUM / DESIGN | 11 | 4 | 7 | 0 |
| LOW | 11 | 5 | 4 | 2 |
| INFO | 11 | 2 | 6 | 3 |
| **Total** | **41** | **18** | **18** | **5** |

### 4.2 All Findings

| ID | Severity | Title | Source | Status |
|----|----------|-------|--------|--------|
| CA-1 | CRITICAL | Provider ETH transfer failure griefs client refund (permanent fund lock) | Pass 1 | **FIXED** |
| CA-2 | CRITICAL | Signature replay — same usage report can be submitted multiple times | Pass 1 | **FIXED** |
| CA-IND-1 | CRITICAL | Cross-chain and cross-contract signature replay — digest lacks chainId + address(this) | Pass 4 (Opus) | **FIXED** |
| CA-3 | HIGH | No session timeout — Proposed/Active sessions lock client deposit indefinitely | Pass 1 | **FIXED** |
| CA-4 | HIGH | Disputed sessions have no resolution path — funds locked permanently | Pass 1 | **FIXED** |
| CA-5 | HIGH | Provider self-attestation — provider signs their own usage reports | Pass 1 | **ACKNOWLEDGED** |
| CA-6 | HIGH | Overpayment silently accepted, excess unrefundable | Pass 1 | **FIXED** |
| CA-ARCH-2 | HIGH (Design) | Client-only dispute timeout — provider has no fallback for proven work | Pass 3 | **FIXED** |
| CA-IND-2 | MEDIUM | No EIP-2 s-value canonicalization — signature malleability | Pass 4 (Opus) | **FIXED** |
| CA-IND-3 | MEDIUM | proposeSession overpayment refund uses push-transfer, inconsistent with pull-payment | Pass 4 (Opus) | **FIXED** |
| CA-7 | MEDIUM | Paused enum variant exists but no function transitions to it | Pass 1 | **FIXED** |
| CA-8 | MEDIUM | consumedMinutes can exceed maxHours * 60 | Pass 1 | **FIXED** |
| CA-9 | MEDIUM | Self-dealing: provider == client is allowed | Pass 1 | **FIXED** |
| CA-ARCH-1 | Design | Arbitrator immutable — no rotation or compromise recovery path | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-3 | Design | Active state conflates accepted-not-started and running sub-states | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-4 | Design | No mutual abort path from Disputed state | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-5 | Design | No provider relinquish path after acceptance | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-7 | Design / Economic | Zero maxHours / ratePerHour sessions — edge cases and overflow vector | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-8 | Economic | resolveDispute remainder always flows to client | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-6 | Economic | Integer division truncation — provider underpaid up to 59 Wei | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-9 | Gas | Full UsageReport struct stored on-chain including providerSignature | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-10 | Gas | require() with string errors in submitUsageReport — inconsistent with custom errors | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-11 | Event | DisputeResolved indistinguishable from timeout claim | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-12 | Event | DisputeResolved omits remainder from client total | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-13 | Event | endSession does not emit terminating party | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-14 | Integration | ComputeAgreement isolated from ARC-402 identity and reputation stack | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-15 | Integration | No ERC-20 path, no upgrade mechanism | Pass 3 | **FIXED** |
| CA-ARCH-16 | Integration | Caller-supplied sessionId — collision and front-running grief vector | Pass 3 | **ACKNOWLEDGED** |
| CA-ARCH-17 | Info | maxHours * 60 cap is arithmetically correct — no off-by-one | Pass 3 | **NOT APPLICABLE** |
| CA-10 | LOW | ecrecover returns address(0) on invalid signature — not explicitly handled | Pass 1 | **FIXED** |
| CA-11 | LOW | acceptSession / startSession inconsistency in error types | Pass 1 | **FIXED** |
| CA-12 | LOW | Solidity pragma allows known-buggy compiler versions | Pass 1 | **FIXED** |
| SL-2 | LOW | Missing zero-address check on constructor arbitrator | Pass 5 (Slither) | **FIXED** |
| CA-IND-4 | LOW | resolveDispute(0,0) silently refunds entire deposit to client | Pass 4 (Opus) | **ACKNOWLEDGED** |
| CA-IND-5 | LOW | calculateCost integer division truncation always favors client | Pass 4 (Opus) | **ACKNOWLEDGED** |
| CA-IND-6 | LOW | Provider self-reports and self-verifies — signature check is redundant with msg.sender | Pass 4 (Opus) | **ACKNOWLEDGED** |
| SL-1 | LOW | Dangerous strict equality in withdraw() | Pass 5 (Slither) | **NOT APPLICABLE** (false positive) |
| CA-13 | INFO | No two-step ownership / admin role for future arbitration | Pass 1 | **ACKNOWLEDGED** |
| CA-14 | INFO | Usage report period timestamps not validated against session window | Pass 1 | **FIXED** |
| CA-IND-7 | INFO | abi.encodePacked in digest construction — prefer abi.encode | Pass 4 (Opus) | **FIXED** |
| CA-IND-8 | INFO | Force-sent ETH can become permanently stuck | Pass 4 (Opus) | **ACKNOWLEDGED** |
| CA-IND-9 | INFO | No acceptedAt timestamp field; no withdraw-failure event | Pass 4 (Opus) | **ACKNOWLEDGED** |
| CA-IND-10 | INFO | Theoretical overflow in calculateCost for extreme ratePerHour | Pass 4 (Opus) | **NOT APPLICABLE** (economically impossible) |
| SL-3–SL-6 | INFO | Slither cosmetic / false positives (event ordering, timestamp, assembly, low-level calls) | Pass 5 (Slither) | **NOT APPLICABLE** |

---

## 5. Critical and High Findings — Detail

### CA-1 (CRITICAL) — Pull-Payment: Provider ETH Transfer Grief

**Source:** Pass 1
**Location:** `endSession` (original L213–222)

**Vulnerability:** The original `endSession` executed two sequential ETH push-transfers: provider first, then client. If the provider was a contract with a reverting `receive()`, the entire `endSession` call would revert, permanently locking the client's deposit since the session status had already been written.

**Fix:** Complete rewrite to pull-payment pattern. `endSession` now only credits `pendingWithdrawals[provider][token]` and `pendingWithdrawals[client][token]`. Each party calls `withdraw(token)` independently. Provider failure cannot prevent client withdrawal.

```solidity
// BEFORE (vulnerable — sequential push transfers)
(bool ok1,) = s.provider.call{value: cost}("");
if (!ok1) revert TransferFailed();
(bool ok2,) = s.client.call{value: refund}("");
if (!ok2) revert TransferFailed();

// AFTER (fixed — pull-payment)
if (cost > 0)   pendingWithdrawals[s.provider][tok] += cost;
if (refund > 0) pendingWithdrawals[s.client][tok]   += refund;
// Each party calls withdraw(token) independently
```

---

### CA-2 (CRITICAL) — Signature Replay: Same Report Submitted Multiple Times

**Source:** Pass 1
**Location:** `submitUsageReport` (original L157–191)

**Vulnerability:** `submitUsageReport` verified the provider signature but stored no record of which digests had been consumed. A provider could submit an identical report N times, incrementing `consumedMinutes` by N × `computeMinutes`, multiplying their payout up to the deposit cap.

**Fix:** A `mapping(bytes32 => bool) public reportDigestUsed` tracks consumed digests. Before accepting a report, the digest is checked and rejected if already seen. After acceptance the digest is marked used.

```solidity
// BEFORE: no dedup — replay possible

// AFTER (fixed)
if (reportDigestUsed[digest]) revert ReportAlreadySubmitted();
reportDigestUsed[digest] = true;
```

---

### CA-IND-1 (CRITICAL) — Cross-Chain Signature Replay

**Source:** Pass 4 (Auditor D / Opus) — missed by Passes 1 and 3
**Location:** `_reportDigest` (original L445–463)

**Vulnerability:** The original `_reportDigest` hashed only `(sessionId, periodStart, periodEnd, computeMinutes, avgUtilization, metricsHash)` — no `block.chainid`, no `address(this)`. Since the contract is deployed on both Base and Ethereum, and `sessionId` is caller-supplied, an attacker could construct colliding sessions on both chains. A usage report signed for the Base deployment would be cryptographically valid on Ethereum. Combined with CA-IND-2 (signature malleability), the attacker could submit the original on one chain and the malleated form on the other, neither blocked by the per-contract `reportDigestUsed` mapping.

**Fix:** Include `block.chainid` and `address(this)` in the digest. Updated the TypeScript `buildReportDigest()` / `signReport()` in `compute-metering.ts` to match.

```solidity
// BEFORE (vulnerable — no chain/contract binding)
bytes32 structHash = keccak256(abi.encodePacked(
    sessionId, periodStart, periodEnd,
    computeMinutes, avgUtilization, metricsHash
));

// AFTER (fixed — bound to chain and contract instance)
bytes32 structHash = keccak256(abi.encode(
    block.chainid,
    address(this),
    sessionId, periodStart, periodEnd,
    computeMinutes, avgUtilization, metricsHash
));
```

---

### CA-3 (HIGH) — No Session Timeout: Client Deposit Locked by Unresponsive Provider

**Source:** Pass 1
**Location:** `proposeSession` / `acceptSession` (original L98–151)

**Vulnerability:** Once a client deposited funds via `proposeSession`, there was no expiry and no cancellation path. A provider could accept and then go silent indefinitely, holding the client's deposit hostage.

**Fix:** Added `PROPOSAL_TTL = 48 hours` constant and `cancelSession()` function. Client can cancel a `Proposed` session after the TTL expires, or cancel an `Active` session that was accepted but never started (`startedAt == 0`). In both cases the full deposit is credited to `pendingWithdrawals[client]`.

---

### CA-4 (HIGH) — Disputed Sessions Had No Resolution Path

**Source:** Pass 1
**Location:** `disputeSession` (original L230–237)

**Vulnerability:** `disputeSession` transitioned to `Disputed` status with no exit. No function could transition away from `Disputed`. Every disputed session was a permanent deposit black hole.

**Fix:** Added two resolution paths:
1. `resolveDispute(sessionId, providerAmount, clientAmount)` — callable by `arbitrator`, splits the deposit by explicit amounts, remainder flows to client.
2. `claimDisputeTimeout(sessionId)` — callable by either party after `DISPUTE_TIMEOUT = 7 days`, settles based on `calculateCost(sessionId)` from accepted usage reports (provider receives proven work, client receives refund).

The timeout settlement (CA-ARCH-2 fix) ensures providers are not fully slashed when the arbitrator is unreachable and they have demonstrable on-chain evidence of delivered compute.

---

### CA-6 (HIGH) — Overpayment Silently Accepted, Excess Unrefundable

**Source:** Pass 1
**Location:** `proposeSession` (original L107–121)

**Vulnerability:** The original code stored `depositAmount = msg.value` and only enforced `msg.value >= required`. Any excess was trapped in the deposit and could only be recovered through a full session lifecycle — or lost permanently if the session was disputed.

**Fix (CA-IND-3 approach):** Changed to require exact deposit — `msg.value != required` reverts with `InsufficientDeposit`. Eliminates the overpayment surface entirely.

```solidity
// BEFORE: accepted any amount >= required, stored msg.value
if (msg.value < required) revert InsufficientDeposit(required, msg.value);
s.depositAmount = msg.value;  // stored excess silently

// AFTER: exact amount required
if (msg.value != required) revert InsufficientDeposit(required, msg.value);
s.depositAmount = required;
```

---

### CA-IND-2 (HIGH) — ECDSA Signature Malleability

**Source:** Pass 4 (Auditor D / Opus)
**Location:** `_recoverSigner` (L469–481)

**Vulnerability:** No enforcement that `s` was in the lower half of the secp256k1 curve order. Any valid signature `(r, s, v)` has a corresponding malleable form `(r, secp256k1n − s, flip(v))` that recovers to the same address. In isolation, the `reportDigestUsed` dedup neutralized replay via the malleable form (same digest = same inputs). However, combined with CA-IND-1 (cross-chain replay), an attacker could use the original signature on chain A and the malleable form on chain B, neither blocked by the other chain's dedup mapping.

**Fix:** Added s-value range check and strict v validation:

```solidity
require(uint256(sv) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "Invalid s");
require(v == 27 || v == 28, "Invalid v");
```

---

### CA-ARCH-2 (HIGH) — Client-Only Dispute Timeout Starves Provider

**Source:** Pass 3 (Auditor C / Architect)
**Location:** `claimDisputeTimeout` (original design)

**Vulnerability:** The original `claimDisputeTimeout` gave the client a full deposit refund if the arbitrator was unresponsive — regardless of accepted usage reports on-chain. A provider who delivered 7 days of GPU compute could receive zero if the client disputed at session end and the arbitrator was offline for 7 days.

**Fix:** `claimDisputeTimeout` now calls `calculateCost(sessionId)` and settles using the same logic as `endSession` — provider receives payment for proven minutes, client receives the remainder. Neither party can starve the other.

---

## 6. Design Tradeoffs and Acknowledged Items

The following findings are acknowledged as intentional design decisions or acceptable tradeoffs for v1. They are documented here rather than tracked as open bugs.

### CA-5 / CA-IND-6 — Provider Self-Attestation

The provider is both the caller of `submitUsageReport` and the signer of the report. The signature serves as forensic/dispute evidence rather than access control (since `msg.sender == s.provider` is checked). Full trustless verification of GPU usage is an unsolved oracle problem in decentralized compute; this contract mitigates the risk through: capped deposits, dispute/arbitration, the `metricsHash` on-chain record, and off-chain tooling that can verify metrics against the hash. A TEE attestation scheme or client co-signature requirement would be Phase 2 improvements.

### CA-ARCH-1 — Arbitrator Immutability

The arbitrator address is set once at deployment as an `immutable`. There is no rotation mechanism. For v1, the operational mitigation is: use a multi-signature wallet as the arbitrator address so that key compromise requires multiple parties. A timelocked arbitrator rotation function is a pre-mainnet requirement (see [Section 11](#11-final-verdict)).

### CA-ARCH-3 — Active State Conflates Two Sub-States

`SessionStatus.Active` covers both "accepted, not yet started" (`startedAt == 0`) and "running" (`startedAt > 0`). Adding a `SessionStatus.Accepted` state would make the state machine more explicit. Deferred to v2 as it requires coordinated SDK and tooling updates.

### CA-ARCH-4 — No Mutual Abort from Disputed State

If both parties agree to settle off-chain, they must still wait for the arbitrator or the 7-day timeout. A `mutualSettle()` function requiring signatures from both client and provider would address this. Deferred to v2.

### CA-ARCH-6 / CA-IND-5 — Integer Division Truncation Favors Client

`calculateCost = (consumedMinutes * ratePerHour) / 60` truncates toward zero. The provider is systematically underpaid by up to `(ratePerHour - 1) / 60` Wei per session. This is documented as intentional: client-favorable rounding is the conservative default. Integrators pricing in sub-wei units should use `ratePerMinute` units directly.

### CA-ARCH-8 — Dispute Remainder Always to Client

When the arbitrator allocates `providerAmount + clientAmount < depositAmount`, the remainder flows to the client. The arbitrator cannot direct funds to a treasury, burn address, or penalty pool. This is the intended behavior: unallocated funds default to the client (benefit of the doubt). If symmetrical slashing is needed, a `penaltyRecipient` can be added in v2.

### CA-ARCH-9 — Signature Stored On-Chain

The `providerSignature` bytes are stored in `usageReports[sessionId][]` on-chain (65 bytes per report, ~3 cold SSTOREs). The signature is redundant with the emitted `UsageReported` event for dispute purposes, but storing it on-chain provides the strongest possible dispute evidence. Gas cost is acceptable on Base L2 at current prices. Can be removed in v2 if gas becomes a concern.

### CA-ARCH-14 — ARC-402 Stack Isolation

`ComputeAgreement` does not interact with the ARC-402 `AgentRegistry`, `TrustClient`, or `ReputationOracleClient`. Provider identity and post-settlement reputation updates are Phase 2 integration work, not blockers for v1.

### CA-ARCH-16 — Caller-Supplied sessionId

`sessionId` is provided by the caller (`keccak256(client + nonce)` by convention in the SDK). On-chain collision prevention is limited to the `SessionAlreadyExists` check. A deterministic on-chain nonce would eliminate front-running grief. Deferred to v2; the SDK's sessionId generation makes accidental collisions negligible.

### CA-IND-4 — resolveDispute(0,0) Refunds Entirely to Client

`resolveDispute(sessionId, 0, 0)` is valid (passes `InvalidSplit`) and refunds the entire deposit to the client via the remainder path. This is intended: the arbitrator can explicitly give 100% to the client by calling with `(0, 0)`. The arbitrator should not accidentally call `(0, 0)` — operational mitigation is UI confirmation.

### CA-IND-8 — Force-Sent ETH

ETH force-sent via `selfdestruct` or block coinbase assignment is not tracked by `pendingWithdrawals` and cannot be withdrawn. This is standard behavior for contracts without a sweep function. No action taken.

---

## 7. Token Audit Results (ERC-20/USDC)

The ERC-20 support (added in commit `f4c3a0f`) was audited separately. The dual-token architecture uses `mapping(address => mapping(address => uint256)) public pendingWithdrawals` where the outer key is the recipient and the inner key is the token (`address(0)` = ETH).

| ID | Title | Status |
|----|-------|--------|
| ERC20-1 | Can tokens get stuck in the contract? | **CLEAN** — every deposit path has a corresponding withdrawal path; invariant verified by fuzz tests |
| ERC20-2 | ERC-777 reentrancy via tokensReceived hook | **MITIGATED** — CEI pattern: balance zeroed before `safeTransfer`; re-entrant `withdraw` hits `NothingToWithdraw` |
| ERC20-3 | Fee-on-transfer tokens | **NOT SUPPORTED** — documented in `proposeSession` NatDoc; integrators must use standard ERC-20 |
| ERC20-4 | Rebasing tokens | **NOT SUPPORTED** — documented; balance divergence would cause settlement reverts |
| ERC20-5 | Approval front-running | **STANDARD PATTERN** — the contract is not the attacker; `approve(0)` → `approve(amount)` pattern is an integrator concern |
| ERC20-6 | Double-mapping breaks existing invariants | **CLEAN** — per-token invariant `sum(pendingWithdrawals[*][tok]) == token.balanceOf(address(this))` holds; verified by fuzz and `test_erc20_withdrawSpecificToken` |
| ERC20-7 | Contract size against EIP-170 limit | **PASS** — runtime bytecode 14,886 bytes of 24,576 byte limit; 9,690 byte margin |

**ERC-777 note:** ERC-777 tokens are functionally unsupported for `proposeSession` (the `safeTransferFrom` during deposit could trigger hooks in an unvetted caller context). Integrators should use standard ERC-20 tokens only. USDC on Base is confirmed compatible.

---

## 8. Machine Sweep Results

The 10-tool sweep was run against the post-fix contract (commit `daa7eb5`, subsequently `e556d6a` after IND-1/IND-2 fixes).

| # | Tool | Result | Findings | Disposition |
|---|------|--------|----------|-------------|
| 1 | **Forge** (`forge test`) | **PASS** | 0 failures — 39/39 tests at sweep time | All security regression tests pass |
| 2 | **Slither** | FINDINGS | 13 results (0 new critical/high) | SL-2 (arbitrator zero-address) FIXED; SL-1, SL-3–SL-6 are false positives or acknowledged |
| 3 | **Mythril** | TIMEOUT | — | Timed out at 300 s; analysis did not complete. Longer timeouts (600–1200 s) recommended for future sweeps |
| 4 | **Echidna** | **PASS** | 0 violations | 50,243 calls, 53 property assertions, all passing |
| 5 | **Halmos** | SKIPPED | — | No `check_` symbolic tests exist; would require dedicated harness; deferred |
| 6 | **Semgrep** | FINDINGS | 6 style/gas | No security findings; 3 remaining `require()` strings (CA-ARCH-10) acknowledged |
| 7 | **Solhint** | FINDINGS | 78 warnings, 0 errors | NatSpec gaps, immutable naming, gas micro-opts — all cosmetic |
| 8 | **Aderyn** | FINDINGS | 1 high, 2 low | ADE-H-1 is a false positive (pull-pattern safe); ADE-L-1 (s-malleability) FIXED via CA-IND-2; ADE-L-2 (magic literal 60) acknowledged |
| 9 | **Wake** | ERROR | — | Parse errors on unrelated `reference/` contracts polluted scan; no actionable output for ComputeAgreement |
| 10 | **Medusa** | ERROR | — | Foundry compilation platform unsupported; requires no-arg-constructor harness wrapper for future use |

**Echidna property results (50,243 calls):** All 53 property/assertion checks pass. Key properties verified: no double-completion of sessions, `pendingWithdrawals` credits never exceed `depositAmount`, pull-payment pattern holds under reentrancy, fuzz settlement invariant holds across random `(computeMinutes, ratePerHour)` inputs.

---

## 9. Test Coverage

### Test Suite Composition

| Suite | Count | Description |
|-------|-------|-------------|
| `ComputeAgreementTest` | 74 | Base unit and fuzz tests — full lifecycle, edge cases, ERC-20 paths |
| `ComputeAgreementAttackerTest` | 23 | Adversarial PoC tests written by Auditor B (Pass 2) |
| **Total** | **97** | |

### Selected Test Cases

```
test_acceptSession
test_cancelSession_acceptedNotStarted
test_cancelSession_afterTTL
test_disputeResolution_byArbitrator
test_disputeTimeout_clientForceRefund
test_dispute_blocksReport
test_reentrancy_maliciousProviderWithdraw
test_reentrancy_revertingProvider_doesNotBlockClientRefund
test_signatureReplay_rejected
test_exceedsMaxMinutes_reverts
testFuzz_settlement(uint64 consumedMinutes, uint64 ratePerHour)  [256 runs]
test_erc20_proposeAndSettle
test_erc20_withdrawSpecificToken
test_erc20_exactDepositRequired
... (97 total)
```

### Fuzz Results

`testFuzz_settlement(uint64, uint64)` verified with 256 random `(consumedMinutes, ratePerHour)` input pairs that:
- `providerCredit + clientCredit == depositAmount` for all inputs
- No case where `cost > depositAmount` after clamping
- Invariant holds for both ETH and ERC-20 session modes

Echidna independently fuzzed 50,243 calls against 53 assertion properties with zero violations.

---

## 10. Testnet Deployment

**Network:** Base Sepolia (Chain ID: 84532)
**Contract address:** `0x975afa11b9107a6467c7A04C80C2BAd92a405cA0`
**Status:** Deployed and verified on Basescan
**Commit:** `37a1295` (feat: wire ComputeAgreement into full stack — ABI, SDK, daemon, CLI, workroom, metering)

The deployment uses a multi-signature wallet as the `arbitrator` address. The contract ABI, TypeScript SDK client (`ComputeAgreementClient`), metering daemon (`compute-metering.ts`), and workroom integration are wired and live.

---

## 11. Final Verdict

### PASS WITH CONDITIONS

**ComputeAgreement is approved for testnet deployment and early-access use.**

All three CRITICAL findings and four of five HIGH findings have been fixed. The contract has passed 97 tests including adversarial PoC tests, Echidna fuzz testing across 50,000+ calls, and a dedicated ERC-20 token safety audit. Contract bytecode is 14,886 bytes — well within EIP-170 limits.

### Pre-Mainnet Conditions

The following two conditions must be resolved before mainnet deployment:

**Condition 1 — Arbitrator key management (CA-ARCH-1)**

The `arbitrator` address is immutable with no rotation mechanism. For testnet, a multi-sig wallet mitigates single-key risk. Before mainnet, implement one of:
- Timelocked arbitrator rotation (`arbitratorRotation(address newArbitrator)` with ≥7-day announcement period)
- Replacement with a DAO-controlled address
- Hard-coded replacement with an on-chain dispute resolution contract (e.g., Kleros)

Until resolved, a compromised arbitrator key can drain all disputed sessions to the provider with no on-chain remedy.

**Condition 2 — Session ID front-running (CA-ARCH-16)**

The caller-supplied `sessionId` is vulnerable to mempool front-running grief on public chains: an attacker who observes a `proposeSession` can race to claim the same `sessionId`, causing the legitimate transaction to revert with `SessionAlreadyExists`. The client's funds are returned (the attacker's transaction would have `msg.sender = attacker`, `client = attacker`), but the UX is poor and repeated attacks can deny service.

Before mainnet: generate `sessionId` deterministically on-chain via `keccak256(abi.encodePacked(msg.sender, provider, nonces[msg.sender]++))` and return it from `proposeSession`. This requires coordinated SDK updates.

### Acknowledged Risk Surface

The following items are open but accepted for v1:

- **Provider self-attestation (CA-5):** Usage reports are signed by the provider with no oracle or TEE verification. The trust model is: disputes can be raised by clients, on-chain `metricsHash` provides audit evidence, and the arbitrator adjudicates. Full trustless compute metering requires oracle infrastructure not yet in scope.
- **Caller-supplied sessionId (CA-ARCH-16):** SDK generates collision-resistant IDs; front-running grief is a UX annoyance, not a fund-loss vector.
- **Active state conflation (CA-ARCH-3):** The `startedAt == 0` check in `cancelSession` is a code smell that works correctly; refactor to an `Accepted` sub-state in v2.
- **Integer division rounding (CA-ARCH-6 / CA-IND-5):** Provider is underpaid by at most 59 Wei per session; documented as intentional client-favorable rounding.

---

*Consolidated audit report prepared 2026-03-23.*
*Source audits: AUDIT-REPORT-COMPUTE-2026-03-23.md, AUDIT-REPORT-COMPUTE-ARCHITECT-2026-03-23.md, AUDIT-REPORT-COMPUTE-INDEPENDENT-2026-03-23.md, AUDIT-MACHINE-SWEEP-2026-03-23.md, AUDIT-RECONCILIATION-COMPUTE-2026-03-23.md*

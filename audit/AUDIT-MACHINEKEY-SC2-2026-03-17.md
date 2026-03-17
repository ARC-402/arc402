# ARC-402 Security Audit: Machine Keys + SettlementCoordinatorV2
**Date:** 2026-03-17
**Auditor:** Claude Sonnet 4.6 (automated security audit)
**Scope:** `contracts/ARC402Wallet.sol` (machine key additions) · `contracts/SettlementCoordinatorV2.sol` (full) · `test/SettlementCoordinatorV2.t.sol` (coverage review)
**Status:** COMPLETE — all Critical/High findings fixed

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 0     | —     |
| High     | 1     | ✅ MK-01 |
| Medium   | 3     | — (documented) |
| Low      | 3     | — (documented) |
| Info     | 3     | — (documented) |

**Forge test result after fixes:** 577 passing, 9 pre-existing failures (unrelated to this audit scope — documented in §Pre-existing Test Failures)

---

## Findings

---

### MK-01 · HIGH · Machine Keys Bypass Emergency Freeze on `openContext()` and `attest()`

**Status:** FIXED ✅

**Description:**
`openContext()` and `attest()` carry the `onlyOwnerOrMachineKey` modifier but **no** `notFrozen` guard. When a wallet is frozen (e.g., by the guardian triggering an emergency `freeze()`), a compromised or malicious machine key can continue to:
1. Call `openContext()` to establish a new context
2. Call `attest()` to pre-load the IntentAttestation registry with high-value spend intents

The fraudulent context and attestations persist in on-chain state. The moment the owner calls `unfreeze()` — not realizing the pipeline has been pre-loaded — the malicious machine key can immediately drain the wallet via `executeSpend()` (which does correctly check `notFrozen`).

The freeze mechanism is intended as a circuit breaker. This gap allows it to be neutralised in advance, making the freeze a speed bump rather than a stop.

**PoC:**
```solidity
// 1. Machine key is compromised or becomes malicious
// 2. Guardian (AI agent) detects anomaly and calls wallet.freeze()
//    → frozen = true

// 3. Malicious machine key operates while frozen (no notFrozen check on these):
vm.prank(maliciousMachineKey);
wallet.openContext(keccak256("drain-ctx"), "claims_processing");  // succeeds ✅

vm.prank(maliciousMachineKey);
wallet.attest(
    keccak256("drain-att"),
    "settle_claim",
    "legitimate looking reason",
    attacker,
    1 ether,
    address(0),
    0
);  // succeeds ✅

// 4. Unsuspecting owner calls unfreeze()
wallet.unfreeze();

// 5. Machine key immediately executes:
vm.prank(maliciousMachineKey);
wallet.executeSpend(payable(attacker), 1 ether, "claims", keccak256("drain-att"));
// → wallet drained
```

**Fix:**
Add `notFrozen` to both `openContext()` and `attest()` in `ARC402Wallet.sol`.

```diff
-function openContext(bytes32 contextId, string calldata taskType) external onlyOwnerOrMachineKey {
+function openContext(bytes32 contextId, string calldata taskType) external onlyOwnerOrMachineKey notFrozen {

-) external onlyOwnerOrMachineKey returns (bytes32) {
+) external onlyOwnerOrMachineKey notFrozen returns (bytes32) {
```

`closeContext()` intentionally retains no `notFrozen` guard — it is a cleanup operation that should remain accessible while frozen.

**Applied:** `contracts/ARC402Wallet.sol` lines 458, 465.

---

### MK-02 · MEDIUM · `verifyAndConsumeAttestation()` Lacks `notFrozen` Guard

**Status:** Documented (no fix required at current risk level)

**Description:**
`verifyAndConsumeAttestation()` enforces only that `msg.sender == _settlementCoordinator()`. It has no `notFrozen` guard of its own. The current V2 coordinator checks `!wallet.frozen()` before calling this function, providing a first-layer guard. However, the function relies entirely on the caller (an upgradable registry-registered coordinator) to enforce the freeze check.

If the registry is updated (owner-timelocked 2 days) to point to a coordinator that omits the freeze check — whether by mistake, future code change, or registry compromise — a frozen wallet's attestations could be consumed and its policy budget decremented without the owner's knowledge.

**PoC:**
```solidity
// Deploy a coordinator that skips the frozen check:
contract BadCoordinator {
    function proposeAndConsumeIgnoringFreeze(address walletAddr, ...) external {
        IARC402WalletV2(walletAddr).verifyAndConsumeAttestation(...);
        // no frozen check — bypasses freeze
    }
}
// After a 2-day registry timelock, register BadCoordinator
// Even frozen wallets can now have attestations consumed
```

**Fix:**
Add `notFrozen` to `verifyAndConsumeAttestation()`:
```diff
-function verifyAndConsumeAttestation(...) external {
+function verifyAndConsumeAttestation(...) external notFrozen {
```
Defence-in-depth: the function should enforce its own invariants rather than relying solely on callers.

---

### MK-03 · MEDIUM · `verifyAndConsumeAttestation()` Lacks `requireOpenContext` Guard

**Status:** Documented (no fix required at current risk level)

**Description:**
`verifyAndConsumeAttestation()` does not require a context to be open. The V2 coordinator checks `wallet.contextOpen()` before calling, but the same "trust the caller" risk applies as in MK-02. A future or malicious coordinator could consume an attestation and record a spend against a wallet with no open context, bypassing the context-bounded-autonomy invariant.

**Fix:**
Add `requireOpenContext` to `verifyAndConsumeAttestation()`:
```diff
-function verifyAndConsumeAttestation(...) external {
+function verifyAndConsumeAttestation(...) external notFrozen requireOpenContext {
```
(Combine with MK-02 fix.)

---

### SC2-01 · MEDIUM · `proposeFromWallet()` Lacks `nonReentrant`

**Status:** Documented (partially mitigated by existing guard)

**Description:**
`proposeFromWallet()` makes an external call to `wallet.verifyAndConsumeAttestation()` without a reentrancy guard. An attacker-controlled wallet can implement a malicious `verifyAndConsumeAttestation()` that re-enters `proposeFromWallet()`.

The existing `proposalId` collision guard (`require(!proposalExists[proposalId])`) provides meaningful protection: same-block, same-parameter reentrant calls generate identical `proposalId`s and revert on duplicate detection. However, an attacker targeting different `recipientWallet` addresses in the reentrant call can create **multiple proposals for different recipients with the same attestationId**, because the proposalId includes `toWallet`.

**PoC:**
```solidity
contract MaliciousWallet {
    SettlementCoordinatorV2 coordinator;

    function verifyAndConsumeAttestation(
        bytes32 id, address, uint256 amount, string calldata cat
    ) external {
        // Reentrant call targeting a different recipient
        coordinator.proposeFromWallet(
            address(this), address(0xDEAD), amount, cat, id
        );
        // Outer call then creates a second proposal targeting original recipient
        // Two proposals created, real attestation not consumed (attacker controls this function)
    }
    // ... other IARC402WalletV2 functions
}
```
Impact is limited to spam and trust registry pollution using attacker-controlled state, not loss of legitimate wallet funds.

**Fix:**
Add `nonReentrant` to `proposeFromWallet()`:
```diff
-function proposeFromWallet(...) external {
+function proposeFromWallet(...) external nonReentrant {
```
Requires importing `ReentrancyGuard` in SettlementCoordinatorV2.

---

### SC2-02 · LOW · ACCEPTED Proposals Stuck in Limbo (expiresAt < acceptedAt + EXECUTION_WINDOW)

**Description:**
`proposeFromWallet()` creates proposals with `expiresAt = block.timestamp + 1 days`. The `EXECUTION_WINDOW` constant is 7 days. Once a proposal is accepted, `execute()` checks both `block.timestamp <= p.expiresAt` (1-day fence) and `block.timestamp <= p.acceptedAt + EXECUTION_WINDOW` (7-day fence).

After the 1-day `expiresAt` passes, `execute()` is blocked. But `expireAccepted()` requires `block.timestamp > p.acceptedAt + EXECUTION_WINDOW`, meaning cleanup is not possible until 7 days after acceptance. An ACCEPTED proposal accepted near the 1-day boundary is stuck in ACCEPTED state for up to ~6 extra days with no way to clean it up.

No funds are at risk (the proposal is dead), but the state is polluted and off-chain consumers may misread the ACCEPTED status.

**Fix:**
Either (a) set `expiresAt = block.timestamp + 7 days` in `proposeFromWallet()`, or (b) add an `expireByExpiresAt()` function that can transition ACCEPTED proposals to EXPIRED if `block.timestamp > p.expiresAt`.

---

### SC2-03 · LOW · No `recipientWallet == address(0)` Validation in `proposeFromWallet()`

**Description:**
`proposeFromWallet()` does not validate `recipientWallet != address(0)`. A malicious or buggy machine key can create a proposal targeting the zero address. The attestation is consumed and the spend is recorded against PolicyEngine limits, but the proposal can never be accepted (no one can call from `address(0)`) or executed usefully.

**Impact:** Policy spend budget is silently depleted for the attestation's amount; the attestation is permanently consumed. A compromised machine key can exploit this to exhaust spending limits.

**Fix:**
```solidity
require(recipientWallet != address(0), "SCv2: zero recipient");
```

---

### MK-04 · LOW · `authorizeMachineKey`/`revokeMachineKey` Not Listed as Governance Ops

**Description:**
`authorizeMachineKey()` and `revokeMachineKey()` use `onlyOwner` (EOA-only) rather than `onlyEntryPointOrOwner`. They are absent from `_isGovernanceOp()`. Consequently, when a UserOp targets either function, `validateUserOp()` auto-approves it (returns 0) as a "protocol op." The EntryPoint then executes the call, which reverts at `onlyOwner` because `msg.sender` is the EntryPoint, not the owner EOA.

A compliant bundler would detect the simulation revert and reject the UserOp before on-chain submission. A non-compliant or attacker-controlled bundler could submit these ops to drain the wallet's EntryPoint gas deposit.

**Fix:**
Add both selectors to `_isGovernanceOp()`:
```solidity
|| selector == this.authorizeMachineKey.selector
|| selector == this.revokeMachineKey.selector
```
This ensures that even if a bundler submits such UserOps, they are rejected at `validateUserOp` with `SIG_VALIDATION_FAILED` rather than burning gas.

---

### MK-05 · LOW · `authorizeMachineKey` Missing Checks Against `authorizedInterceptor` and `address(this)`

**Description:**
`authorizeMachineKey()` guards against `key == owner` and `key == guardian` but not against:
- `key == authorizedInterceptor`: The interceptor was granted only `executeTokenSpend` access (via `onlyOwnerOrInterceptor`). Authorizing it as a machine key additionally grants it `openContext`, `attest`, `closeContext`, and `executeSpend` — a significant privilege escalation.
- `key == address(this)`: The wallet itself as a machine key enables self-referential call patterns.

**Fix:**
```solidity
if (key == authorizedInterceptor) revert WAuth();
if (key == address(this)) revert WSelf();
```

---

### MK-06 · INFO · `revokeMachineKey()` Emits Event for Non-Existent Keys

**Description:**
`revokeMachineKey(key)` sets `authorizedMachineKeys[key] = false` and emits `MachineKeyRevoked` unconditionally. If `key` was never authorized, the event is misleading and can confuse off-chain monitors tracking the machine key lifecycle.

**Fix:**
```solidity
function revokeMachineKey(address key) external onlyOwner {
    require(authorizedMachineKeys[key], "WalletAuth: key not authorized");
    authorizedMachineKeys[key] = false;
    emit MachineKeyRevoked(key);
}
```

---

### SC2-04 · INFO · Zero-Amount Proposals Permitted

**Description:**
`proposeFromWallet()` does not validate `amount > 0`. A zero-amount proposal wastes gas and inflates proposal state. During `execute()`, `msg.value == 0 == p.amount` passes, sending 0 ETH to the recipient.

**Fix:** `require(amount > 0, "SCv2: zero amount");`

---

### SC2-05 · INFO · `walletAddress` Authenticity Not Verified

**Description:**
`proposeFromWallet()` accepts any address as `walletAddress`. The only validity check is `wallet.owner() != address(0)`. Any contract implementing `IARC402WalletV2` can be used, including attacker-deployed contracts. Malicious contracts can create proposals with `fromWallet` set to attacker-controlled addresses, polluting the proposal registry.

Impact is limited because execution requires the malicious contract to supply ETH (via `execute()`), and no legitimate wallet is affected. The primary risk is off-chain system confusion and event log pollution.

**Fix:**
Consider registering wallets in the protocol registry and validating `walletAddress` against it, or emitting a warning event for unrecognized wallets. This is a systemic change outside the current scope.

---

## Test Coverage Review

`test/SettlementCoordinatorV2.t.sol` — 18 tests

| Area | Coverage |
|------|----------|
| Happy path (wallet caller) | ✅ `test_proposeFromWallet_byWallet_success` |
| Happy path (machine key caller) | ✅ `test_proposeFromWallet_byMachineKey_success` |
| SettlementProposed event | ✅ `test_proposeFromWallet_emitsSettlementProposed` |
| Unauthorized caller | ✅ `test_proposeFromWallet_rejects_unauthorizedCaller` |
| Owner calling directly (not wallet) | ✅ `test_proposeFromWallet_rejects_ownerDirectly` |
| Frozen wallet | ✅ `test_proposeFromWallet_rejects_frozenWallet` |
| No open context | ✅ `test_proposeFromWallet_rejects_noOpenContext` |
| Attestation mismatch | ✅ `test_proposeFromWallet_rejects_badAttestation` |
| Attestation replay | ✅ `test_proposeFromWallet_rejects_attestationReplay` |
| Policy violation | ✅ `test_proposeFromWallet_rejects_policyViolation` |
| Full flow (propose→accept→execute) | ✅ `test_proposeFromWallet_fullSettlementFlow` |
| V1 propose() auth enforcement | ✅ `test_propose_requiresCallerIsFromWallet` |
| Execution window expiry | ✅ `test_expireAccepted_afterWindow` |
| **Not tested** | |
| `amount == 0` proposal | ❌ Missing (SC2-04) |
| `recipientWallet == address(0)` | ❌ Missing (SC2-03) |
| Reentrancy via malicious wallet | ❌ Missing (SC2-01) |
| Stuck ACCEPTED state (expiresAt limbo) | ❌ Missing (SC2-02) |
| Machine key attest/openContext while frozen | ❌ Missing (MK-01 — fixed; regression test recommended) |

---

## Pre-existing Test Failures (Out of Scope)

9 tests were failing before and after this audit's changes. They document a planned architecture migration ("Spec 30") that removes machine keys and replaces `onlyOwnerOrMachineKey` with `onlyEntryPointOrOwner` on protocol operations (`openContext`, `attest`, `closeContext`, `executeSpend`). These failures are tracked in `test/ARC402Wallet.machineKey.t.sol` and `test/AUDIT-MEGA-ATTACKER-2026-03-16.t.sol`. They are not regressions introduced by this audit.

---

## Changes Applied

| File | Change | Finding |
|------|--------|---------|
| `contracts/ARC402Wallet.sol:465` | Added `notFrozen` to `openContext()` | MK-01 |
| `contracts/ARC402Wallet.sol:458` | Added `notFrozen` to `attest()` | MK-01 |

---

*Audit conducted 2026-03-17. Scope limited to machine key additions and SettlementCoordinatorV2 as specified.*

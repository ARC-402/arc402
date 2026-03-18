# ERC-4337 Mega Builder Audit — ARC-402 Wallet System
**Date:** 2026-03-18
**Auditor:** Builder perspective (correctness, completeness, spec compliance)
**Scope:** ARC402Wallet, WalletFactoryV3, WalletFactoryV4, IntentAttestation, PolicyEngine + supporting libs
**Status:** FIXED — all findings addressed 2026-03-18 (see FIX-SUMMARY-ERC4337-MEGA-2026-03-18.md)

---

## Summary Table

| ID | Severity | Contract | Title | Status |
|----|----------|----------|-------|--------|
| F-01 | HIGH | PolicyEngine | contextId marked used on first spend — all subsequent spends in same context rejected | ✅ FIXED |
| F-02 | HIGH | ARC402Wallet | `verifyAndConsumeAttestation` missing `notFrozen` and `requireOpenContext` guards | ✅ FIXED |
| F-03 | MEDIUM | ARC402Wallet | Attestations not bound to a context — cross-context consumption possible | ✅ FIXED |
| F-04 | MEDIUM | ARC402Wallet | Protocol bypass allows `address(0)` target when optional registry entries are unset | ✅ FIXED |
| F-05 | MEDIUM | ARC402Wallet | `executeContractCall` approval intercept only covers `approve()` — `increaseAllowance` and `permit` bypass it | ✅ FIXED |
| F-06 | MEDIUM | ARC402Wallet | `velocityLimit` is independent per asset type (ETH vs token) — effective limit doubles | ✅ FIXED (documented) |
| F-07 | MEDIUM | ARC402Wallet | `_isGovernanceOp` missing `authorizeMachineKey` and `revokeMachineKey` selectors | ✅ FIXED |
| F-08 | LOW | ARC402Wallet | `executeSpend` (ETH) not callable via EntryPoint UserOp — inconsistent with `executeTokenSpend` | ✅ FIXED |
| F-09 | LOW | ARC402Wallet | `validateUserOp` does not pack time-range into `validationData` — attestation expiry causes late execution failure | ✅ FIXED (documented) |
| F-10 | LOW | WalletFactoryV3/V4 | Factory calls `initWallet` redundantly — constructor already calls it | ✅ FIXED |
| F-11 | LOW | VelocityLib | `bucketStart` set to `block.timestamp` on rotation — not aligned to bucket boundaries (diverges from PolicyEngine) | ✅ FIXED |
| F-12 | LOW | ARC402Wallet | Freeze preserves open-context state — unfreezing resumes in pre-freeze context | ✅ FIXED |
| F-13 | INFO | ARC402Wallet | P256 low-s normalization not enforced — signature malleability possible | ✅ FIXED |
| F-14 | INFO | ARC402Wallet | Prefund sent before signature validation — deviates from ERC-4337 SimpleAccount reference | ✅ FIXED (comment) |
| F-15 | INFO | WalletFactoryV3/V4 | CREATE (not CREATE2) used — no deterministic wallet addresses for ERC-4337 counterfactual deployment | ✅ FIXED (documented) |

---

## F-01 — HIGH: PolicyEngine contextId marked used on first spend; all subsequent spends in same context are rejected

**Location:** `PolicyEngine.sol` — `validateSpend` (line 324), `recordSpend` (line 372)

**Description:**
`recordSpend` marks the wallet's `activeContextId` as used:
```solidity
if (contextId != bytes32(0)) {
    _usedContextIds[contextId] = true;
}
```
`validateSpend` then rejects any future spend where the contextId is already used:
```solidity
if (contextId != bytes32(0) && _usedContextIds[contextId]) {
    return (false, "PolicyEngine: contextId already used");
}
```
The first successful spend within any open context permanently marks that context's ID as exhausted. Every subsequent call to `executeSpend` or `executeTokenSpend` while the same context is active will return `(false, "PolicyEngine: contextId already used")` from `validateSpend`, which causes `_validateSpendPolicy` to emit `SpendRejected` and revert.

**Impact:**
Wallets cannot execute more than one spend per context. All multi-step agent tasks (e.g. pay for API call A, then pay for API call B in the same task context) will fail on the second spend. The only workaround is to close and reopen a new context between each spend, but this defeats the purpose of a context window and breaks the audit trail intent.

This affects `executeSpend`, `executeTokenSpend`, and `verifyAndConsumeAttestation`.

**Fix:**
The contextId uniqueness check is designed to prevent replaying a *service agreement* contextId across two distinct wallet sessions. If that is the intent, the check should only apply to fresh context openings rather than individual spends. One option:
- Remove the `_usedContextIds` check from `validateSpend` entirely and enforce it only at `openContext` time (so the same contextId can never be opened twice).
- Alternatively, change the semantic: call `_usedContextIds[contextId] = true` in `closeContext`, not in `recordSpend`. This allows unlimited spends within a context while still preventing replay of a closed context's ID.

---

## F-02 — HIGH: `verifyAndConsumeAttestation` missing `notFrozen` and `requireOpenContext` guards

**Location:** `ARC402Wallet.sol` — `verifyAndConsumeAttestation` (line 675)

**Description:**
```solidity
function verifyAndConsumeAttestation(
    bytes32 attestationId,
    address recipient,
    uint256 amount,
    string calldata category
) external {
    if (msg.sender != address(_settlementCoordinator())) revert WNotCoord();
    if (!_intentAttestation().verify(...)) revert WAtt();
    _validateSpendPolicy(recipient, amount, category);
    _intentAttestation().consume(attestationId);
    _policyEngine().recordSpend(address(this), category, amount, activeContextId);
}
```
The function performs intent verification, policy validation, attestation consumption, and spend recording — the same accounting path as `executeSpend`. However, it is missing both:
1. `notFrozen` — A frozen wallet can still have its attestation consumed and spend recorded by the SettlementCoordinator.
2. `requireOpenContext` — The function can be called when no context is open (`contextOpen == false`, `activeContextId == bytes32(0)`). In that case, `recordSpend` is called with `contextId = bytes32(0)`, which skips the contextId deduplication entirely and severs the audit trail.

`SettlementCoordinatorV2.proposeFromWallet` (lines 200-201) does check `!wallet.frozen()` and `wallet.contextOpen()` via the `IARC402WalletV2` interface before calling `verifyAndConsumeAttestation`. However, the wallet-side function itself has no guards, so:
- Any future coordinator version, upgraded coordinator, or direct call path could invoke it without those checks.
- Defense-in-depth is violated: security-critical invariants should be enforced inside the function, not solely in the caller.

**Impact:**
A future coordinator (or a compromised coordinator) can call `verifyAndConsumeAttestation` on a frozen wallet to consume an attestation and record a spend, bypassing the circuit breaker. The spend is recorded in PolicyEngine (consuming daily/hourly limits) and the attestation is marked used, even though no actual fund transfer has occurred yet in this path — the settlement still requires a separate `execute()` call. The main risk is DoS: attestations can be "used up" and limits consumed on a frozen wallet.

**Fix:**
Add `notFrozen` and `requireOpenContext` modifiers to `verifyAndConsumeAttestation`:
```solidity
function verifyAndConsumeAttestation(...) external notFrozen requireOpenContext {
    if (msg.sender != address(_settlementCoordinator())) revert WNotCoord();
    ...
}
```

---

## F-03 — MEDIUM: Attestations not bound to a context — cross-context consumption possible

**Location:** `ARC402Wallet.sol` — `attest` (line 552); `IntentAttestation.sol` — `attest` (line 40)

**Description:**
The `attest` function in `ARC402Wallet` does not require `requireOpenContext` and does not record the `activeContextId` in the attestation. The `IntentAttestation` contract also stores no context binding. This means:
1. An attestation can be created before any context is open.
2. An attestation created during context A remains valid (and can be consumed) during context B, after context A is closed.

Example sequence:
```
openContext(ctxA)           // open context A
attest(id1, ...)            // create attestation
closeContext()              // close context A
openContext(ctxB)           // open context B
executeSpend(..., id1)      // succeeds — id1 consumed in context B
```
The `SpendExecuted` event references `attestationId = id1` but the spend is recorded against `ctxB` in PolicyEngine, even though the intent was formed during `ctxA`. This creates an audit trail mismatch and can allow a machine key to pre-stage spending permissions across context boundaries.

**Impact:**
Medium. An autonomous machine key could create a batch of attestations before closing a context, then consume them across multiple future contexts. This is not fund-draining by itself (policy limits still apply), but it breaks the intended context-bounded spending governance model.

**Fix:**
Two options:
- Record `activeContextId` inside the attestation at creation time and verify it matches the wallet's `activeContextId` at consumption time.
- Require `requireOpenContext` in `ARC402Wallet.attest()` so attestations can only be created within an active context. This is the simpler fix.

---

## F-04 — MEDIUM: Protocol bypass allows `address(0)` target when optional registry entries are unset

**Location:** `ARC402Wallet.sol` — `executeContractCall` (line 742)

**Description:**
The protocol contract bypass list is built from the current registry:
```solidity
ARC402RegistryV2.ProtocolContracts memory pc = _resolveContracts();
bool isProtocolContract = (
    params.target == pc.policyEngine ||
    params.target == pc.trustRegistry ||
    ...
    params.target == pc.serviceAgreement ||    // may be address(0)
    params.target == pc.sessionChannels ||     // may be address(0)
    params.target == pc.agentRegistry ||       // may be address(0)
    params.target == pc.reputationOracle ||    // may be address(0)
    params.target == pc.vouchingRegistry ||    // may be address(0)
    params.target == pc.migrationRegistry      // may be address(0)
);
```
`ARC402RegistryV2` only enforces non-zero for `policyEngine`, `trustRegistry`, `intentAttestation`, and `settlementCoordinator`. The remaining six fields default to `address(0)` and can be set later. If any of them is `address(0)`, then any call with `params.target == address(0)` is treated as a protocol contract call, bypassing `PolicyEngine.validateContractCall` entirely. A call to `address(0)` with ETH value would send ETH to the zero address (burned), and the call itself succeeds silently.

**Impact:**
The owner/EntryPoint can drain ETH to the zero address through `executeContractCall` without PolicyEngine DeFi whitelist validation. The ETH is lost rather than stolen, but it bypasses the intended governance control for external contract calls. Only exploitable while optional registry entries are at their zero default.

**Fix:**
Add a zero-address guard at the start of `executeContractCall`:
```solidity
if (params.target == address(0)) revert WZero();
```
This is simpler and more robust than filtering zero entries from the protocol list.

---

## F-05 — MEDIUM: `executeContractCall` approval intercept only covers `approve()` — `increaseAllowance` and `permit` bypass it

**Location:** `ARC402Wallet.sol` — `executeContractCall` (line 770)

**Description:**
The approval intercept checks specifically for the `approve(address,uint256)` selector (0x095ea7b3):
```solidity
if (sel == bytes4(0x095ea7b3)) {
    (bool approveOk, string memory approveReason) = IDefiPolicy(_pe).validateApproval(...);
    require(approveOk, approveReason);
}
```
Two common approval mechanisms are not intercepted:
- `increaseAllowance(address,uint256)` — selector `0x39509351` — used by many OZ ERC-20 tokens
- `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` — ERC-2612 gasless approval — widely used in DeFi

An agent can call `increaseAllowance` or `permit` via `executeContractCall` to grant unbounded approvals to DeFi contracts without triggering `validateApproval`. The `PolicyEngine.validateApproval` check for infinite approvals (`type(uint256).max`) is specifically bypassed.

**Impact:**
The infinite-approval prevention (one of PolicyEngine's primary DeFi safety rails) can be bypassed by calling `increaseAllowance(spender, type(uint256).max)` via `executeContractCall`. The `validateApproval` path only catches the explicit `approve()` call.

**Fix:**
Extend the approval intercept to cover additional selectors:
```solidity
bytes4 constant INCREASE_ALLOWANCE = bytes4(keccak256("increaseAllowance(address,uint256)"));
// For permit: consider checking amount == type(uint256).max in post-call approval tracking
if (sel == bytes4(0x095ea7b3) || sel == INCREASE_ALLOWANCE) {
    // validate approval
}
```
For `permit`, a post-call check of `IERC20(token).allowance(address(this), spender)` could detect if an infinite approval was granted.

---

## F-06 — MEDIUM: `velocityLimit` is independent per asset type — effective limit is 2× what the owner may intend

**Location:** `ARC402Wallet.sol` — `_checkEthVelocity` (line 599), `_checkTokenVelocity` (line 608)

**Description:**
The wallet-level velocity limit (`velocityLimit`) is applied independently to the ETH spending bucket and the token spending bucket:
```solidity
_walletVelocity.curEth += amount;
if (velocityLimit > 0 && _walletVelocity.curEth + _walletVelocity.prevEth > velocityLimit) {
    _triggerVelocityFreeze();
}
// and separately:
_walletVelocity.curToken += amount;
if (velocityLimit > 0 && _walletVelocity.curToken + _walletVelocity.prevToken > velocityLimit) {
    _triggerVelocityFreeze();
}
```
A wallet with `velocityLimit = 1 ETH` can spend 1 ETH via `executeSpend` AND 1 ETH-equivalent of tokens via `executeTokenSpend` in the same window without triggering the freeze — an effective limit of 2× `velocityLimit`.

**Impact:**
The velocity limit provides weaker protection than the owner may expect. A machine key that goes rogue can spend up to 2× the configured limit before the circuit breaker engages.

**Fix:**
Either (a) document explicitly that `velocityLimit` is a per-asset-type limit and rename to `ethVelocityLimit` / `tokenVelocityLimit`, or (b) maintain a combined sum and compare against a single unified limit.

---

## F-07 — MEDIUM: `_isGovernanceOp` missing `authorizeMachineKey` and `revokeMachineKey` selectors

**Location:** `ARC402Wallet.sol` — `_isGovernanceOp` (line 267), `authorizeMachineKey` (line 392), `revokeMachineKey` (line 401)

**Description:**
`authorizeMachineKey` and `revokeMachineKey` both use the `onlyOwner` modifier (not `onlyEntryPointOrOwner`). As a result, they cannot be called via the EntryPoint at all (the EntryPoint is not the owner). However, these selectors are also absent from the `_isGovernanceOp` list.

The effect is subtle but has two consequences:
1. **Inconsistency**: Any UserOp targeting `authorizeMachineKey` passes validation as a "protocol op" (auto-approved) but then fails in execution with `WAuth()`. Gas is consumed without execution. This wastes the bundler's gas allocation.
2. **Future regression risk**: If `authorizeMachineKey` or `revokeMachineKey` are ever updated to use `onlyEntryPointOrOwner` (to allow the owner to authorize keys via UserOps), they would become exploitable — a machine key or bundler could submit a UserOp that auto-approves validation and then authorizes an attacker-controlled address as a new machine key, without requiring an owner signature.

Machine key authorization is one of the most security-sensitive governance operations in the system. It should be classified as governance from day one.

**Fix:**
Add the selectors to `_isGovernanceOp`:
```solidity
|| selector == this.authorizeMachineKey.selector
|| selector == this.revokeMachineKey.selector
```
Additionally, consider changing `authorizeMachineKey` and `revokeMachineKey` to use `onlyEntryPointOrOwner` so they can be called via UserOps with proper owner signature requirement.

---

## F-08 — LOW: `executeSpend` not callable via EntryPoint UserOp

**Location:** `ARC402Wallet.sol` — `executeSpend` (line 627), `executeTokenSpend` (line 646)

**Description:**
`executeSpend` (ETH) uses `onlyOwnerOrMachineKey`:
```solidity
function executeSpend(...) external onlyOwnerOrMachineKey requireOpenContext notFrozen {
```
`executeTokenSpend` (ERC-20) uses a custom check that explicitly includes the EntryPoint:
```solidity
if (msg.sender != address(entryPoint) && msg.sender != owner && msg.sender != authorizedInterceptor) revert WAuth();
```
This asymmetry means:
- ERC-20 token spends can be executed via ERC-4337 UserOps (through the EntryPoint).
- ETH spends cannot — any UserOp calling `executeSpend` passes `validateUserOp` (auto-approved as protocol op) but reverts in execution with `WAuth()`. The bundler is paid for wasted gas.

**Impact:**
ETH spends cannot be included in ERC-4337 transaction bundles. Machine keys operating via the bundler (the standard ERC-4337 pattern) cannot autonomously execute ETH spends. Only EOA calls work for ETH spending, which bypasses the bundler's gas sponsorship model.

**Fix:**
Add EntryPoint to `executeSpend`'s access check, matching `executeTokenSpend`:
```solidity
function executeSpend(...) external requireOpenContext notFrozen {
    if (msg.sender != address(entryPoint) && msg.sender != owner && !authorizedMachineKeys[msg.sender]) revert WAuth();
    ...
}
```

---

## F-09 — LOW: `validateUserOp` does not use time-range packing in `validationData`

**Location:** `ARC402Wallet.sol` — `validateUserOp` (line 224)

**Description:**
ERC-4337 v0.7 supports packing a time validity window into `validationData`:
```
validationData = <20-byte aggregator> | <6-byte validUntil> | <6-byte validAfter>
```
The wallet always returns `0` (success) or `1` (failed) without encoding a `validUntil`. When a UserOp contains an attestationId with an `expiresAt` timestamp, the attestation may expire between the time the bundler simulates the op and the time the EntryPoint executes it. The bundler has no way to know the op has a limited validity window.

**Impact:**
If an attestation expires between bundler simulation and on-chain execution, the UserOp reverts in execution after passing validation. This wastes gas for both the bundler and the wallet's deposit. While not a security issue, it creates a poor experience in production and can cause a small gas leak.

**Fix:**
For UserOps that target spend functions, resolve the attestation's `expiresAt` during validation and pack it into `validationData`:
```solidity
// In validateUserOp, for protocol spend ops:
uint256 validUntil = _getAttestationExpiry(userOp.callData);
if (validUntil > 0) {
    return (uint256(validUntil) << 160);  // pack validUntil, no aggregator
}
```
This requires decoding the attestationId from calldata inside `validateUserOp`, which adds complexity. An acceptable minimum fix is to document this limitation and advise bundlers to set short expiry windows.

---

## F-10 — LOW: Factory calls `initWallet` redundantly — ARC402Wallet constructor already calls it

**Location:** `WalletFactoryV3.sol` (line 75), `WalletFactoryV4.sol` (line 71), `ARC402Wallet.sol` constructor (line 204)

**Description:**
The `ARC402Wallet` constructor calls:
```solidity
_trustRegistry().initWallet(address(this));
```
Both `WalletFactoryV3.createWallet()` and `WalletFactoryV4.createWallet()` also call:
```solidity
ITrustRegistry(reg.trustRegistry()).initWallet(wallet);
```
after `CREATE` completes. `TrustRegistry.initWallet` is idempotent (guarded by `if (!initialized[wallet])`), so the second call is a no-op and does not cause failures. However, it wastes ~5,000 gas on each wallet creation for a SLOAD + condition check, and is a maintenance hazard if `initWallet` is ever changed to be non-idempotent in a future registry version.

**Impact:**
Gas waste (~5,000 gas per wallet creation). No security impact with current `TrustRegistry`.

**Fix:**
Remove the redundant `initWallet` call from both factory contracts. Trust initialization is already handled in the constructor. If the factory needs to perform post-deployment initialization that the constructor cannot, document the two-step initialization clearly.

---

## F-11 — LOW: `VelocityLib` bucket advances to `block.timestamp`, not aligned to bucket boundaries

**Location:** `VelocityLib.sol` — `advance` (line 26), `PolicyEngine.sol` — `_recordBucketSpend` (line 238)

**Description:**
When `VelocityLib.advance` rotates the bucket, it sets `bucketStart = block.timestamp`:
```solidity
v.bucketStart = block.timestamp;
```
`PolicyEngine._recordBucketSpend` instead aligns to the previous bucket boundary:
```solidity
w.currentBucketStart = w.currentBucketStart + BUCKET_DURATION;
```
The difference: in `VelocityLib`, if no transaction occurs for 13 hours then a transaction occurs, a new bucket starts at that moment, effective for another 12 hours. The previous bucket's data (12 hours old) is already stale. In `PolicyEngine`, the bucket boundary advances strictly by `BUCKET_DURATION`, so the effective window is always exactly `2 × BUCKET_DURATION`.

**Impact:**
Minor inconsistency. In `VelocityLib`, the worst-case rolling window effective period can be up to `3 × BUCKET_DURATION` minus epsilon (old previous bucket + partial current bucket). In `PolicyEngine` it's bounded to `2 × BUCKET_DURATION`. Both are effectively bounded in practice but the inconsistency makes reasoning about exact limits harder.

**Fix:**
Align `VelocityLib.advance` with `PolicyEngine._recordBucketSpend` by advancing `bucketStart` in aligned steps:
```solidity
v.bucketStart = v.bucketStart + VELOCITY_BUCKET_DURATION;
// If still behind: v.bucketStart = block.timestamp (for the double-advance case)
```

---

## F-12 — LOW: Freeze preserves open-context state — unfreezing resumes pre-freeze context

**Location:** `ARC402Wallet.sol` — `freeze` / `freeze(string)` / `freezeAndDrain` (lines 414–457), `unfreeze` (line 461)

**Description:**
The `freeze` functions set `frozen = true` but do not close an open context (`contextOpen` remains `true`, `activeContextId` is preserved). After `unfreeze()`, the wallet immediately resumes in the previously open context. A machine key can continue spending from the pre-freeze context without re-opening.

This may be intentional (the owner wants state preserved) but creates two issues:
1. If the freeze was triggered because a machine key was compromised, unfreezing puts the wallet back in a context the compromised key was operating in.
2. If the context has stale state (e.g., related to a service agreement that was abandoned), the wallet is in an incorrect operational state after unfreeze.

**Impact:**
Low risk in practice because only the owner (or guardian) can unfreeze, and the owner can explicitly close the context after unfreezing. But it's a subtle footgun for automated recovery flows.

**Fix:**
Either (a) close the context in `freeze()` before setting `frozen = true`, or (b) document clearly that operators must manually call `closeContext()` after `unfreeze()` if the pre-freeze context should be abandoned.

---

## F-13 — INFO: P256 signature low-s normalization not enforced

**Location:** `ARC402Wallet.sol` — `_validateP256Signature` (line 301); `P256VerifierLib.sol` — `validateP256Signature` (line 19)

**Description:**
The P256 signature `s` value is not constrained to the lower half of the curve order (`s <= n/2`). For any valid signature `(r, s)`, the signature `(r, n - s)` is also mathematically valid. Neither the wallet nor `P256VerifierLib` reject high-s signatures.

The RIP-7212 precompile (0x100) accepts both forms, so signatures with malleable `s` will pass. This is standard for ECDSA/P256 and the ERC-4337 nonce mechanism prevents replay of the same `(r, s)` with a different nonce. However, if the same `userOpHash` and nonce are ever presented with both `(r, s)` and `(r, n-s)`, both would validate.

**Impact:**
Informational. ERC-4337 nonce protection prevents actual replay attacks. The concern is signature canonicality for off-chain indexing and signature deduplication systems.

**Fix:**
Add a low-s check in `P256VerifierLib.validateP256Signature`:
```solidity
// P256 curve order n
bytes32 constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
if (uint256(s) > uint256(N) / 2) return SIG_INVALID;
```

---

## F-14 — INFO: Prefund ETH to EntryPoint occurs before signature validation

**Location:** `ARC402Wallet.sol` — `validateUserOp` (line 236)

**Description:**
The wallet sends the prefund to the EntryPoint before validating the signature:
```solidity
if (missingAccountFunds > 0) {
    (bool ok,) = payable(address(entryPoint)).call{value: missingAccountFunds}("");
    if (!ok) revert WPrefund();
}
// ... signature validation follows
```
The ERC-4337 `SimpleAccount` reference implementation sends the prefund AFTER signature validation, returning early with `SIG_VALIDATION_FAILED` if the sig is invalid (without prefunding). The wallet's inline comment claims this matches the reference implementation, but it does not.

The practical impact is minimal because:
- The EntryPoint is trusted and handles the accounting correctly.
- If validation later returns `SIG_VALIDATION_FAILED` for a governance op, the EntryPoint retains the prefund as gas payment, which is expected.
- The prefund occurs before state reads, not before the msg.sender check.

The comment at line 232 ("matches the ERC-4337 reference implementation order") is factually incorrect and should be corrected to avoid misleading future maintainers.

**Impact:**
Informational. Incorrect code comment. No functional security impact.

**Fix:**
Correct the comment to say the order was chosen to avoid a specific reentrancy edge case (calling the EntryPoint is safe because msg.sender == EntryPoint is already validated), rather than claiming it matches the reference implementation.

---

## F-15 — INFO: Factories use `CREATE` not `CREATE2` — no deterministic wallet addresses

**Location:** `WalletFactoryV3.sol` (line 68), `WalletFactoryV4.sol` (line 64)

**Description:**
Both factories deploy wallets with `CREATE`, which produces addresses derived from `(factory_address, factory_nonce)`. This means:
1. A wallet's address cannot be predicted before deployment.
2. The ERC-4337 `initCode` mechanism for first-UserOp wallet deployment (which requires a predictable address) cannot be used.
3. Paymasters cannot validate "not yet deployed" wallets since the address isn't known in advance.

The standard ERC-4337 pattern uses `CREATE2` with a salt (typically derived from the owner address) to produce deterministic addresses, enabling counterfactual wallet deployment where users can fund the wallet address before it's deployed.

**Impact:**
Informational/usability. No security impact. Users must deploy their wallet first before sending funds to it, which is a worse onboarding UX than the standard ERC-4337 counterfactual flow.

**Fix:**
Replace `CREATE` with `CREATE2` using a salt derived from the owner address:
```solidity
bytes32 salt = keccak256(abi.encode(msg.sender, ep));
assembly {
    wallet := create2(0, add(initCode, 0x20), mload(initCode), salt)
}
```
This requires a corresponding `getWalletAddress(address owner, address ep)` view function for off-chain address prediction.

---

## `_isGovernanceOp` Complete Selector Audit

All functions using `onlyEntryPointOrOwner` (callable via UserOps) and their governance classification:

| Function | Modifier | In `_isGovernanceOp`? | Correct? |
|----------|----------|----------------------|----------|
| `proposeRegistryUpdate` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `executeRegistryUpdate` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `cancelRegistryUpdate` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `setAuthorizedInterceptor` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `setGuardian` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `freeze(string)` | `onlyEntryPointOrOwner` | ✅ Yes (via keccak256) | ✅ |
| `unfreeze` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `setVelocityLimit` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `updatePolicy` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `setPasskey` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `clearPasskey` | `onlyEntryPointOrOwner` | ✅ Yes | ✅ |
| `authorizeMachineKey` | `onlyOwner` | ❌ No | ⚠️ Missing (see F-07) |
| `revokeMachineKey` | `onlyOwner` | ❌ No | ⚠️ Missing (see F-07) |
| `freeze()` (guardian) | custom guardian check | N/A (guardian-only) | ✅ |
| `freezeAndDrain` | custom guardian check | N/A (guardian-only) | ✅ |

Functions NOT in the governance list but callable via EntryPoint as protocol ops:
- `executeTokenSpend` — explicitly allows EntryPoint. Auto-approves. ✅ By design.
- `attest` — uses `onlyOwnerOrMachineKey`, EntryPoint call would fail in execution. ⚠️ Minor (F-08 class)
- `openContext` — same as above. ⚠️
- `closeContext` — same as above. ⚠️
- `executeSpend` — same as above. ⚠️ Documented as F-08.
- `verifyAndConsumeAttestation` — coordinator-only. ✅

---

## ERC-4337 Spec Compliance Summary

| Check | Status | Notes |
|-------|--------|-------|
| `validateUserOp` does not revert on bad sig | ✅ Pass | Uses `tryRecover`; P256 returns FAILED not revert |
| `validateUserOp` callable only by EntryPoint | ✅ Pass | `if (msg.sender != address(entryPoint)) revert WEp()` |
| Returns 0/1 validationData | ✅ Pass | Returns `SIG_VALIDATION_SUCCESS` (0) or `SIG_VALIDATION_FAILED` (1) |
| Prefund handling | ✅ Pass | Sends `missingAccountFunds` to EntryPoint; reverts if transfer fails |
| No state-changing ops in validation | ✅ Pass | Prefund call is the only external call; `frozen` is a read |
| Time-range encoding in validationData | ❌ Missing | See F-09 |
| Nonce validation | ✅ Pass | Delegated to EntryPoint (standard pattern) |
| EntryPoint v0.7 PackedUserOperation struct | ✅ Pass | Correct struct definition in ERC4337.sol |

---

## Context Lifecycle Invariant Audit

| Invariant | Enforced? | Where |
|-----------|-----------|-------|
| Can't open context when one is already open | ✅ | `openContext`: `if (contextOpen) revert WCtx()` |
| Can't close a context that isn't open | ✅ | `closeContext`: `requireOpenContext` |
| Can't spend without an open context (`executeSpend`) | ✅ | `requireOpenContext` modifier |
| Can't spend without an open context (`executeTokenSpend`) | ✅ | `requireOpenContext` modifier |
| Can't spend without an open context (`verifyAndConsumeAttestation`) | ❌ | Missing guard (F-02) |
| Attestation requires open context to create | ❌ | Not required (F-03) |
| Context reuse after close | ✅ (partially) | PolicyEngine marks contextId used on first spend (F-01 side effect) |
| Frozen wallet can't spend | ✅ (`executeSpend`) | `notFrozen` modifier |
| Frozen wallet can't spend (`verifyAndConsumeAttestation`) | ❌ | Missing (F-02) |

---

## PolicyEngine Integration Audit

| Spend Point | `validateSpend` Called? | `recordSpend` Called? | Notes |
|-------------|------------------------|----------------------|-------|
| `executeSpend` | ✅ | ✅ | Correct order |
| `executeTokenSpend` | ✅ | ✅ | Correct order |
| `verifyAndConsumeAttestation` | ✅ | ✅ | Guards missing (F-02) |
| `executeContractCall` (non-protocol) | ✅ (via `validateContractCall`) | ❌ | `recordSpend` not called for DeFi calls — velocity and daily limits not updated |
| `executeContractCall` (protocol) | ❌ | ❌ | Bypassed entirely — no policy accounting |

**Additional finding in table:** `executeContractCall` does not call `recordSpend` for any call path. DeFi calls consume value without updating the velocity window or daily spend window in PolicyEngine. An agent could call an external DeFi protocol many times via `executeContractCall` without those calls counting against the hourly velocity limit.

---

## Factory Security Summary

| Check | WalletFactoryV3 | WalletFactoryV4 |
|-------|----------------|----------------|
| Anyone can deploy for themselves | ✅ Correct | ✅ Correct |
| Can deploy for someone else | ❌ No (msg.sender = owner) | ❌ No (msg.sender = owner) |
| SSTORE2/oracle bytecode corruption | Low risk — EXTCODECOPY reads deployed bytecode | Low risk — same |
| Zero-address registry/chunk/oracle check | ✅ Constructor validates | ✅ Constructor validates |
| Deterministic address (CREATE2) | ❌ Not used (F-15) | ❌ Not used (F-15) |
| Double initWallet | ✅ Idempotent (no breakage) | ✅ Idempotent (no breakage) |
| Reentrancy in createWallet | wake-disable comment present | wake-disable comment present |
| Custom entryPoint support | ✅ Via parameter | ✅ Via parameter |

---

## Appendix: `executeContractCall` Missing `recordSpend` (Unlisted Additional Finding)

**Severity:** MEDIUM
**Location:** `ARC402Wallet.sol` — `executeContractCall` (line 724)

`executeContractCall` validates DeFi calls via `validateContractCall` (checks whitelist and max value) and `validateApproval` (checks approve calls), but it never calls `_policyEngine().recordSpend()`. DeFi transactions processed through this function are invisible to PolicyEngine's velocity tracking (`maxTxPerHour`, `maxSpendPerHour`) and daily category limits (`dailyCategoryLimit`).

This means a machine key could use `executeContractCall` to perform an unlimited number of DeFi swaps at arbitrary value without triggering any velocity-based rate limits or daily caps. The `validateContractCall` per-call max value limit (`maxContractCallValue`) is the only constraint, and it applies per-transaction, not cumulatively.

**Fix:** After a successful call in `executeContractCall`, record the spend if `params.value > 0`:
```solidity
if (params.value > 0) {
    _policyEngine().recordSpend(address(this), "defi", params.value, activeContextId);
}
```

---

*End of audit — 2026-03-18*

# ERC-4337 Mega Audit — Fix Summary
**Date:** 2026-03-18
**Scope:** ARC402Wallet, WalletFactoryV4, PolicyEngine, VelocityLib, P256VerifierLib, IPolicyEngine, IntentAttestation
**Tests:** 612 passed, 0 failed after all fixes

---

## Fixed Findings

### CRITICAL-1 / Builder-CRITICAL: executeContractCall not in `_isGovernanceOp`

**Contract:** `ARC402Wallet.sol`

Added `executeContractCall.selector` to `_isGovernanceOp`. Any ERC-4337 UserOp targeting `executeContractCall` now requires a valid owner ECDSA or P256 signature — unsigned UserOps return `SIG_VALIDATION_FAILED`. This closes the zero-precondition wallet drain vector.

Also added `authorizeMachineKey.selector` and `revokeMachineKey.selector` to `_isGovernanceOp`, and changed both functions from `onlyOwner` to `onlyEntryPointOrOwner` so owners can authorize/revoke machine keys via signed UserOps (F-07 / Attacker INFO-2).

---

### HIGH-1 / Attacker CRITICAL-3: Velocity freeze broken — revert undoes `frozen = true`

**Contract:** `ARC402Wallet.sol` — `_triggerVelocityFreeze()`

Removed `revert WVel()` from `_triggerVelocityFreeze()`. Previously, the `revert` in the same call frame rolled back `frozen = true`, `frozenAt`, `frozenBy`, and the `WalletFrozen` emit — the freeze never persisted on-chain. The fix commits the freeze state permanently: the breach-triggering spend succeeds and completes, but `frozen = true` persists for all subsequent calls.

```solidity
// Before: revert rolled back the frozen state
function _triggerVelocityFreeze() internal {
    frozen = true;
    ...
    revert WVel();  // ← undid all state above
}

// After: freeze persists; breach spend completes; subsequent spends blocked
function _triggerVelocityFreeze() internal {
    frozen = true;
    frozenAt = block.timestamp;
    frozenBy = address(this);
    emit WalletFrozen(address(this), "velocity limit exceeded", block.timestamp);
    // Intentionally NOT reverting — freeze persists; spending stops at next call
}
```

---

### HIGH-2 / Builder-F-02: `verifyAndConsumeAttestation` missing guards

**Contract:** `ARC402Wallet.sol`

Added `notFrozen` and `requireOpenContext` modifiers to `verifyAndConsumeAttestation`. Frozen wallets can no longer have attestations consumed by the SettlementCoordinator; and the coordinator can no longer record spends against a null contextId.

---

### F-01 / Attacker INFO-3: PolicyEngine contextId scoping and mark-used timing

**Contract:** `PolicyEngine.sol`

Two changes combined:
1. Changed `_usedContextIds` from `mapping(bytes32 => bool)` to `mapping(address => mapping(bytes32 => bool))` — contextId deduplication is now per-wallet, preventing cross-wallet contextId collision grief.
2. Moved `_usedContextIds[wallet][contextId] = true` from `recordSpend` to the new `closeContext(address wallet, bytes32 contextId)` function — contextIds are now marked used only when the context is closed, not on the first spend. This allows unlimited spends within a single open context.

Also added `closeContext` to `IPolicyEngine` interface, and `ARC402Wallet.closeContext()` now calls `_policyEngine().closeContext(address(this), closedContextId)`.

---

### F-03 / Attacker MEDIUM-1: Context lifecycle fixes

**Contract:** `ARC402Wallet.sol`

Two guards added:
1. `attest()` now has `requireOpenContext` modifier — attestations can only be created within an active context, binding them to that context.
2. `openContext()` now rejects `contextId == bytes32(0)` with `revert WCtx()` — prevents the zero-contextId bypass that disabled PolicyEngine deduplication.

---

### F-04: `executeContractCall` null target guard

**Contract:** `ARC402Wallet.sol`

Added `if (params.target == address(0)) revert WZero()` at the start of `executeContractCall`. This prevents ETH from being silently sent to `address(0)` (burned) when optional registry entries default to zero.

---

### F-05: `increaseAllowance` approval intercept

**Contract:** `ARC402Wallet.sol`

Extended the approval intercept in `executeContractCall` to also catch `increaseAllowance(address,uint256)` (selector `0x39509351`). Previously, `validateApproval` could be bypassed by calling `increaseAllowance` instead of `approve`.

---

### F-06: Velocity limit per-asset documentation

**Contract:** `ARC402Wallet.sol`

Added clear NatSpec documentation that `velocityLimit` is enforced independently per asset type (ETH and tokens each have their own rolling window). Wallet operators who want combined-asset enforcement should set `velocityLimit` to half their intended total.

---

### F-08 / Attacker LOW-4: EntryPoint and machine keys added to spend execution

**Contract:** `ARC402Wallet.sol`

- `executeSpend`: changed from `onlyOwnerOrMachineKey` to an explicit check that also allows `address(entryPoint)`, enabling ETH spends via ERC-4337 UserOps.
- `executeTokenSpend`: added `authorizedMachineKeys[msg.sender]` to the auth check, enabling machine keys to execute token spends (consistent with ETH spend behavior).
- Both functions: `notFrozen` is checked BEFORE `requireOpenContext` so frozen wallets return `WFrozen`, not `WCtx`.

---

### F-09: `validateUserOp` time-range limitation documented

**Contract:** `ARC402Wallet.sol`

Added NatSpec documentation explaining that `validateUserOp` returns `0` or `1` without encoding a `validUntil` time range. Bundlers cannot determine if an attestation will expire before execution. Wallet operators should set short attestation expiry windows and understand that gas may be consumed on expired attestations.

---

### F-10 / Attacker MEDIUM-4: Removed redundant `initWallet` call from WalletFactoryV4

**Contract:** `WalletFactoryV4.sol`

Removed the `ITrustRegistry(reg.trustRegistry()).initWallet(wallet)` call from `createWallet()`. The `ARC402Wallet` constructor already calls `_trustRegistry().initWallet(address(this))`. The second call was a ~5,000 gas waste and a maintenance hazard if `initWallet` ever becomes non-idempotent.

---

### F-11: VelocityLib bucket alignment

**Contract:** `VelocityLib.sol`

Fixed `advance()` to use aligned bucket boundaries on single-rotation:
```solidity
// Before: v.bucketStart = block.timestamp (not aligned)
// After:  v.bucketStart = v.bucketStart + VELOCITY_BUCKET_DURATION
```
On double-rotation (gap > 2× bucket duration), `v.bucketStart = block.timestamp` is still used. This matches PolicyEngine's aligned-step behavior and ensures the rolling window is always exactly `2 × VELOCITY_BUCKET_DURATION`.

---

### F-12 / Attacker LOW-5: Freeze closes context and syncs PolicyEngine

**Contract:** `ARC402Wallet.sol`, `PolicyEngine.sol`, `IPolicyEngine.sol`

Three changes:
1. All freeze paths (`freeze(string)`, `freeze()`, `freezeAndDrain()`) now close any open context before setting `frozen = true`.
2. All freeze paths now call `_policyEngine().freezeSpend(address(this))` to synchronize the PolicyEngine freeze state.
3. `unfreeze()` now calls `_policyEngine().unfreeze(address(this))`.

Added `freezeSpend(address wallet)` and `unfreeze(address wallet)` to `IPolicyEngine`.

---

### F-13 / Attacker LOW-1: P256 low-s normalization

**Contract:** `P256VerifierLib.sol`

Added the P256 curve order constant `P256_N` and a low-s check:
```solidity
if (uint256(s) > P256_N / 2) return SIG_INVALID;
```
High-s signatures are now rejected, enforcing canonical form and preventing off-chain signature deduplication issues.

---

### F-14: Corrected `validateUserOp` prefund comment

**Contract:** `ARC402Wallet.sol`

Corrected the inline comment that falsely claimed the prefund-before-validation order matches the ERC-4337 `SimpleAccount` reference implementation. It does not. The comment now accurately states that the current order is intentional and safe (EntryPoint is the trusted msg.sender) but differs from the reference.

---

### F-15: CREATE vs CREATE2 limitation documented

**Contract:** `WalletFactoryV4.sol`

Added a code comment (F-15 KNOWN LIMITATION) explaining why `CREATE` is used instead of `CREATE2`, what counterfactual wallet deployment requires, and a concrete code sketch for a future `WalletFactoryV5` with `CREATE2` and salt support. No code change — this is a design limitation by intent.

---

## Not Fixed (Accepted / Out of Scope)

| Finding | Reason |
|---------|--------|
| CRITICAL-2: EntryPoint deposit griefing | By design — protocol ops auto-approve in validateUserOp. The fix would require machine-key sigs for all ops, changing the wallet's UX model. Mitigation: maintain minimal EP deposits; monitoring. |
| HIGH-3: `setDailyLimitFor` bypasses timelock | PolicyEngine architecture scope — the timelock and `setDailyLimitFor` are separate governance primitives. Fix requires a PolicyEngine redesign. Tracked separately. |
| MEDIUM-2: AttestationId griefing | Off-chain concern — attestationIds should use sufficient entropy (prevrandao + nonce). No on-chain fix needed for the current on-chain model. |
| MEDIUM-3: Registry upgrade to malicious registry | The 2-day timelock is the intentional mitigation. Guardian monitoring is the defense. |
| LOW-2: `emergencyOwnerOverride` no timelock | Break-glass function by design. Timelock would undermine its purpose. Document and monitor. |
| LOW-3: Machine key context griefing | Machine key authorization model — the owner can revoke keys. Low operational risk. |

---

## Test Changes

Updated tests to reflect changed behavior:

| Test File | Change |
|-----------|--------|
| `ARC402Wallet.t.sol` | 8 tests updated: context guards, velocity freeze expects success+frozen, unfreeze restores context |
| `ARC402Wallet.erc4337.t.sol` | `test_validateUserOp_protocolOp_executeContractCall_approves` → renamed + expects `SIG_VALIDATION_FAILED` |
| `ARC402Wallet.machineKey.t.sol` | `test_owner_canAttest` + `test_machineKey_canAttest`: open context before attest; `test_entryPoint_cannotCallExecuteSpend` → updated: now expects `WAtt` not `WAuth` |
| `AUDIT-MEGA-ATTACKER-2026-03-16.t.sol` | `test_ATK04`: assertion inverted to `SIG_VALIDATION_FAILED` confirming CRITICAL-1 fix |
| `SettlementCoordinatorV2.t.sol` | `test_proposeFromWallet_rejects_noOpenContext`: open context, attest, close context, then propose |

---

*Fix implementation: 2026-03-18 | All 612 tests green | forge build: 0 errors*

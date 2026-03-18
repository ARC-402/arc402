# ARC-402 Adversarial Security Audit — ERC-4337 Mega Attacker Perspective
**Date:** 2026-03-18
**Scope:** ARC402Wallet, WalletFactoryV3/V4, IntentAttestation, PolicyEngine
**Auditor perspective:** Sophisticated external attacker
**Status:** FIXED — all actionable findings addressed 2026-03-18 (see FIX-SUMMARY-ERC4337-MEGA-2026-03-18.md)

---

## Executive Summary

This audit was conducted from a pure attacker perspective: assume every attack surface is in scope, every invariant can be tested, and the goal is funds-at-risk or protocol-breaking outcomes.

**Critical finding identified**: A single design oversight in `validateUserOp` — `executeContractCall` is not classified as a governance operation — enables **any external attacker to drain any unfrozen ARC402Wallet of ETH and ERC-20 tokens via ERC-4337 UserOp submission with no valid signature.** This is a complete wallet drain with no preconditions beyond the wallet being unfrozen.

**Additional findings**: The wallet velocity freeze mechanism is architecturally broken (revert undoes the freeze), SettlementCoordinator can execute spends on frozen wallets, and the 24-hour cap reduction timelock is bypassable via a sibling function.

---

## Findings

---

### [CRITICAL-1] executeContractCall not in governance ops — any attacker can drain any wallet via ERC-4337

**Severity:** CRITICAL
**Category:** ERC-4337 / Authorization Logic

**Attack vector:**

`validateUserOp` classifies calls into governance ops (require owner signature) and protocol ops (auto-approve). `executeContractCall` is **not** in `_isGovernanceOp`, so any UserOp calling it auto-approves without any signature check. Since `executeContractCall` uses `onlyEntryPointOrOwner`, it passes auth when called by the EntryPoint during UserOp execution.

Step-by-step drain of wallet `V`:

1. Attacker crafts UserOp: `sender=V, callData=executeContractCall({target: policyEngine, data: whitelistContract(V, attackerContract), value: 0, ...})`
2. Attacker submits to bundler. `V.validateUserOp()` is called on-chain.
3. `_isGovernanceOp(executeContractCall.selector)` → false → `_validatePolicyBounds()` → returns 0 (auto-approve, wallet not frozen).
4. EntryPoint executes callData on V. `msg.sender = entryPoint` → `onlyEntryPointOrOwner` passes.
5. `executeContractCall` calls `policyEngine.whitelistContract(V, attackerContract)`. From PolicyEngine's view `msg.sender = V` → `onlyWalletOwnerOrWallet(V)` passes. Attacker's contract is now whitelisted.
6. Attacker crafts second UserOp: `sender=V, callData=executeContractCall({target: attackerContract, value: V.balance, approvalToken: USDC, maxApprovalAmount: V.USDCBalance, data: drain()})`
7. Auto-approves. PolicyEngine.validateContractCall: defiAccessEnabled=true, attackerContract whitelisted, maxContractCallValue=0 (unlimited) → passes.
8. `forceApprove(attackerContract, V.USDCBalance)` is set before the call.
9. `attackerContract.drain()` calls `USDC.transferFrom(V, attacker, balance)` and keeps the forwarded ETH.
10. After return, approval reset to 0 — but USDC is already gone.

**Preconditions:**
- Target wallet is unfrozen (frozen wallets return SIG_VALIDATION_FAILED).
- Target wallet has an EntryPoint deposit to pay for the two UserOps (or attacker uses a paymaster).
- DeFi access is enabled (it is, by default, set in the ARC402Wallet constructor).

**Impact:**
Complete drain of all ETH and ERC-20 balances from any unfrozen wallet. No owner interaction required. Attacker cost: gas to submit two UserOps. This is a **zero-precondition remote drain** exploitable by any on-chain attacker.

**Root cause:**
`executeContractCall` is gated by `onlyEntryPointOrOwner`. All `onlyEntryPointOrOwner` functions should require owner signature (be in `_isGovernanceOp`), because the EntryPoint auto-approves non-governance ops. `executeContractCall` was added to the `onlyEntryPointOrOwner` access list but not added to `_isGovernanceOp`.

**Fix:**
Add `executeContractCall` (and any other `onlyEntryPointOrOwner` functions that should require owner consent) to `_isGovernanceOp`:

```solidity
function _isGovernanceOp(bytes4 selector) internal pure returns (bool) {
    return selector == this.executeContractCall.selector  // ADD THIS
        || selector == this.setGuardian.selector
        // ... existing entries
}
```

---

### [CRITICAL-2] ERC-4337 EntryPoint deposit griefing via protocol op auto-approve

**Severity:** CRITICAL (griefing)
**Category:** ERC-4337 / DoS

**Attack vector:**

Any non-governance function auto-approves in `validateUserOp`. An attacker can flood the EntryPoint with failing UserOps targeting any protocol function:

1. Craft UserOp: `sender=V, callData=executeSpend(attacker, 1 ether, "pay", fakeAttestationId)`
2. `validateUserOp` returns 0 (auto-approve — not a governance op, wallet not frozen).
3. EntryPoint deducts gas from `V`'s deposit and attempts execution.
4. Execution reverts (`WAtt()` — attestation invalid, or `WCtx()` — no open context).
5. Bundler is compensated from `V`'s deposit. `V`'s deposit shrinks.
6. Repeat until deposit is zero. Wallet can no longer submit UserOps via EntryPoint.

**Preconditions:**
- Wallet has a non-zero EntryPoint deposit.
- No signature required.

**Impact:**
Complete DoS of the wallet's ERC-4337 functionality. The wallet cannot submit any UserOps once its deposit is drained, including governance operations to fix the situation (unless owner can call directly, bypassing EntryPoint). Can be combined with CRITICAL-1 to ensure the wallet can't defend itself.

**Note on CRITICAL-1 relationship:** CRITICAL-1 is a superset of this — if CRITICAL-1 is fixed by adding `executeContractCall` to governance ops, this finding still exists independently for all other protocol ops (`executeSpend`, `openContext`, etc.).

**Fix:**
For high-value protocol ops that should not be callable by anonymous bundlers without some form of authorization, consider requiring at minimum a machine-key signature in `validateUserOp` for calls that will fail without proper state (open context, valid attestation, etc.). Alternatively, document the deposit drain risk and instruct wallet operators to maintain minimal deposits.

---

### [HIGH-1] Velocity freeze mechanism is architecturally broken — revert undoes `frozen = true`

**Severity:** HIGH
**Category:** Circuit Breaker / State Management

**Attack vector:**

`_triggerVelocityFreeze()` sets `frozen = true`, emits `WalletFrozen`, then calls `revert WVel()`. In Solidity, `revert` rolls back **all state changes in the current call frame**, including `frozen = true`. The freeze never persists.

```solidity
function _triggerVelocityFreeze() internal {
    frozen = true;           // ← set
    frozenAt = block.timestamp;
    frozenBy = address(this);
    emit WalletFrozen(...);  // ← emitted (also reverted)
    revert WVel();           // ← REVERTS ALL ABOVE
}
```

**What an attacker observes:**
- A compromised machine key can spend up to `velocityLimit` repeatedly in successive transactions (each transaction near the limit succeeds, the one that would breach it reverts and the attacker retries with a smaller amount).
- The wallet owner **never receives the WalletFrozen alert** — the emit is also reverted.
- The velocity bucket state is also reverted on breach, meaning the limit is re-checked fresh on the next attempt.

**Preconditions:** Machine key compromise, or a machine key operator executing at maximum speed.

**Impact:**
- The velocity freeze alert (the entire point of the mechanism as an owner notification) never fires.
- An attacker with a machine key can drain up to the daily policy limit in small increments without triggering the freeze, preventing the guardian/owner from receiving an on-chain signal of anomalous behavior.

**Fix:**
The freeze must be committed to a persistent location before the revert. Options:
- Use a separate external call to commit the freeze state before reverting (but this changes the gas model).
- Move the velocity check to `validateUserOp` before any state changes (the check is read-only; actual state mutation happens separately).
- Accept that velocity breach just reverts (no drain happens) but remove the false promise of a freeze, and instead rely on the PolicyEngine's per-hour velocity tracking as the rate-limiting mechanism.

---

### [HIGH-2] `verifyAndConsumeAttestation` missing `notFrozen` and `requireOpenContext` guards

**Severity:** HIGH
**Category:** Authorization / Circuit Breaker

**Code location:** `ARC402Wallet.sol:675`

```solidity
function verifyAndConsumeAttestation(
    bytes32 attestationId,
    address recipient,
    uint256 amount,
    string calldata category
) external {
    if (msg.sender != address(_settlementCoordinator())) revert WNotCoord();
    // ← NO notFrozen check
    // ← NO requireOpenContext check
    if (!_intentAttestation().verify(...)) revert WAtt();
    _validateSpendPolicy(recipient, amount, category);
    _intentAttestation().consume(attestationId);
    _policyEngine().recordSpend(address(this), category, amount, activeContextId);
}
```

**Attack scenario:**
1. Machine key is compromised. It creates attestations and begins spending.
2. Guardian detects anomaly, calls `freezeAndDrain` — wallet is frozen (`frozen = true`), ETH/tokens sent to owner.
3. However: attestations created before the drain are still unconsumed in IntentAttestation.
4. Attacker controls the SettlementCoordinator (or has a pending settlement proposal).
5. SettlementCoordinator calls `verifyAndConsumeAttestation` on the frozen wallet.
6. `frozen = true` but there is **no `notFrozen` check** — the call proceeds.
7. `_validateSpendPolicy` calls `PolicyEngine.validateSpend` which checks `spendFrozen`, not `frozen`. If `PolicyEngine.spendFrozen` is not set, the policy validation passes.
8. The attestation is consumed and spend is recorded. Any subsequent ETH transfer happens at the SettlementCoordinator level.

**Additional gap:** `activeContextId` may be `bytes32(0)` if no context is open. With `contextId == 0`, PolicyEngine skips contextId deduplication, allowing repeated settlement calls for the same conceptual context.

**Preconditions:**
- Attacker controls the SettlementCoordinator registered in the wallet's registry, OR
- The SettlementCoordinator has been triggered via a pre-existing proposal.

**Impact:**
Frozen wallet can still have policy spend recorded and attestations consumed via settlement, potentially allowing residual settlement actions after the wallet was frozen for security reasons. This undermines the guardian's emergency freeze effectiveness.

**Fix:**
Add `notFrozen` and `requireOpenContext` modifiers:
```solidity
function verifyAndConsumeAttestation(...) external notFrozen requireOpenContext {
```
Also propagate wallet freeze to PolicyEngine: when `freeze()` is called, also call `policyEngine.freezeSpend(address(this))`.

---

### [HIGH-3] `setDailyLimitFor` bypasses the 24-hour cap reduction timelock

**Severity:** HIGH
**Category:** PolicyEngine / Access Control

**Attack vector:**

PolicyEngine implements a 24-hour timelock on daily limit reductions via `queueCapReduction` + `applyCapReduction`. However, `setDailyLimitFor` can **immediately** set any daily limit (increase or decrease) with no timelock:

```solidity
function setDailyLimitFor(address wallet, string calldata category, uint256 limit) external {
    require(walletOwners[wallet] == msg.sender || wallet == msg.sender, "PolicyEngine: not authorized");
    dailyCategoryLimit[wallet][category] = limit;  // ← immediate, no timelock
}
```

An attacker who has compromised the owner EOA (phishing, private key leak) can:
1. Call `setDailyLimitFor(wallet, "pay_api", MAX_UINT256)` — unlimited daily spend
2. Immediately drain the wallet within the same transaction via machine key or interceptor

The documented security property ("cap reductions require 24-hour timelock") is completely unenforceable.

**Also:** `setDailyLimitFor` allows INCREASES to the daily limit, which are arguably more dangerous than decreases. No timelock on increases either.

**Preconditions:** Compromised owner EOA (can also be social engineering of the off-chain system that calls these functions).

**Impact:**
The timelock defense against "insider" policy manipulation is illusory. An attacker who gains momentary owner access can escalate limits and drain immediately.

**Fix:**
Either: (a) remove `setDailyLimitFor` in favor of the timelocked `queueCapReduction`/`applyCapReduction` flow; or (b) add a timelock to `setDailyLimitFor` as well (for limit increases and decreases beyond a threshold); or (c) document that `setDailyLimitFor` is owner-controlled and the timelock only applies to agent-initiated reductions.

---

### [MEDIUM-1] Context ID `bytes32(0)` disables PolicyEngine contextId deduplication

**Severity:** MEDIUM
**Category:** PolicyEngine / Logic

**Attack vector:**

`openContext` accepts any `contextId`, including `bytes32(0)`:
```solidity
function openContext(bytes32 contextId, string calldata taskType) external onlyOwnerOrMachineKey notFrozen {
    if (contextOpen) revert WCtx();
    activeContextId = contextId;  // ← no check that contextId != 0
    ...
}
```

In `PolicyEngine.validateSpend`:
```solidity
if (contextId != bytes32(0) && _usedContextIds[contextId]) {
    return (false, "PolicyEngine: contextId already used");
}
```

With `contextId = 0`, the deduplication check is entirely skipped. In `recordSpend`:
```solidity
if (contextId != bytes32(0)) {
    _usedContextIds[contextId] = true;  // ← not set for contextId=0
}
```

A compromised machine key can open an infinite number of contexts with `contextId = 0`, cycle through attest → executeSpend, and the contextId replay protection never activates. This doesn't bypass per-tx limits or daily limits, but it bypasses the per-context deduplication semantic.

**Impact:**
The contextId uniqueness guarantee (one policy evaluation per unique context) can be bypassed. Allows the same "context identity" to be reused indefinitely. Combined with machine key compromise, this maximizes the spend rate.

**Fix:**
Add `require(contextId != bytes32(0), "WCtx")` to `openContext`.

---

### [MEDIUM-2] AttestationId griefing — external attacker can pre-register IDs to block wallet attestations

**Severity:** MEDIUM
**Category:** IntentAttestation / DoS

**Attack vector:**

`IntentAttestation.attest()` is a **public, permissionless function**. Anyone can call it directly, setting `wallet = msg.sender` (the caller). The uniqueness check is on `attestationId`:

```solidity
function attest(...) external {
    require(!exists[attestationId], "IntentAttestation: already exists");
    attestations[attestationId] = Attestation({
        wallet: msg.sender,  // ← attacker's address, not the victim wallet
        ...
    });
    exists[attestationId] = true;
}
```

An attacker who can predict the `attestationId` the victim wallet will use (e.g., sequential nonces, keccak256 of timestamp+nonce, or any deterministic scheme) can front-run by calling `attest(targetId, ...)` from their own address. The ID is now "taken" but with `wallet = attacker`.

When the victim wallet tries to call `ARC402Wallet.attest(targetId, ...)`, it fails with "IntentAttestation: already exists". The spend cannot proceed until a different attestationId is chosen.

**Impact:**
- Continuous DoS on wallet spending if attestationIds are predictable.
- If attestationIds are generated off-chain from predictable state (block.timestamp, sequential counters), an attacker monitoring the mempool can pre-fill IDs to prevent specific spends.
- The attack is cheap: each griefing transaction only costs minimal gas.

**Preconditions:**
- Attacker can observe or predict the target attestationId.

**Fix:**
Generate attestationIds with sufficient entropy (e.g., keccak256(block.prevrandao, msg.sender, nonce, block.timestamp) off-chain, or use a nonce-based scheme that's wallet-specific). Alternatively, add a `msg.sender == wallet || authorized` check to `IntentAttestation.attest()`, since only wallets should be able to create attestations.

---

### [MEDIUM-3] Registry upgrade to attacker-controlled registry bypasses all protocol contract whitelists

**Severity:** MEDIUM
**Category:** Registry Upgrade / Trust Escalation

**Attack vector:**

After a successful registry upgrade (requires 2-day timelock, owner-initiated):

1. Owner is phished or social-engineered into proposing `newRegistry = attackerRegistry`.
2. Two days pass. Owner doesn't notice or cancel.
3. `executeRegistryUpdate()` is called.
4. `registry = attackerRegistry`.

Now `_resolveContracts()` returns attacker-controlled addresses. In `executeContractCall`:

```solidity
ARC402RegistryV2.ProtocolContracts memory pc = _resolveContracts();
bool isProtocolContract = (
    params.target == pc.policyEngine ||   // ← attacker's address
    params.target == pc.trustRegistry ||  // ← attacker's address
    ...
);
if (!isProtocolContract) {
    // DeFi whitelist check
}
// Protocol contracts pass through — no whitelist check!
```

With a malicious registry returning attacker-controlled contract addresses as "protocol contracts", `executeContractCall` will bypass PolicyEngine validation for any call to those attacker contracts. A machine key or owner can then drain the wallet by calling the malicious "protocol contracts".

Additionally, `_policyEngine()`, `_intentAttestation()`, and `_trustRegistry()` all resolve from the new registry, meaning ALL policy and attestation checks use attacker-controlled logic.

**Preconditions:** Compromised owner EOA who initiates `proposeRegistryUpdate`. The 2-day timelock provides a window for detection.

**Impact:**
Complete compromise of all wallet security once the registry swap executes. All protocol-level security is delegated to the registry, which becomes the single point of trust.

**Fix:**
The 2-day timelock is the mitigation. Additionally, consider: emit a loud on-chain event with guardian notification at propose-time; require guardian signature to execute (not just owner); or add a registry address allowlist.

---

### [MEDIUM-4] Double `initWallet` call in WalletFactory may cause deployment revert

**Severity:** MEDIUM
**Category:** Factory / Initialization

**Code locations:** `WalletFactoryV3.sol:75`, `WalletFactoryV4.sol:70`, and `ARC402Wallet.sol:204`

Both the ARC402Wallet constructor and the factory's `createWallet` call `ITrustRegistry.initWallet(wallet)`:

```solidity
// In ARC402Wallet constructor:
_trustRegistry().initWallet(address(this));  // first call

// In WalletFactoryV3.createWallet():
ITrustRegistry(reg.trustRegistry()).initWallet(wallet);  // second call
```

If `ITrustRegistry.initWallet` is not idempotent (i.e., reverts on re-initialization), all wallet deployments via the factory would fail at the factory level after the constructor completes. The wallet would be deployed but the factory would revert, leaving the wallet deployed but unregistered in `ownerWallets`.

**Preconditions:** TrustRegistry implementation of `initWallet` reverts on already-initialized wallets.

**Impact:**
If TrustRegistry has this behavior, factory-based wallet deployment is completely broken. The wallet would exist at an address but the factory wouldn't record it, and the owner's `ownerWallets` mapping would be empty.

**Fix:**
Remove the redundant `initWallet` call from the factory. The constructor already initializes the wallet. Alternatively, make `initWallet` idempotent (safe to call twice).

---

### [MEDIUM-5] Machine key can drain ETH up to policy limits with no response window

**Severity:** MEDIUM
**Category:** Machine Key / Threat Model

**Attack vector:**

A compromised machine key can:
1. Call `openContext(bytes32(0), "attack")`.
2. Call `attest(id1, "pay", "", attacker, maxPerTxLimit, address(0), 0)`.
3. Call `executeSpend(attacker, maxPerTxLimit, "pay", id1)`.
4. Repeat steps 2-3 up to daily limit.
5. Optionally call `closeContext()` and `openContext()` again to reset contextId.

The machine key can drain the wallet's ETH up to the configured daily limit before:
- The velocity freeze fires (it doesn't fire — see HIGH-1).
- The owner or guardian has a chance to respond.

There is no timelock on machine key operations. The entire daily limit can be drained in a single block by submitting many transactions, or across multiple blocks.

**Impact:**
A compromised machine key can extract the full ETH daily limit without any timelocking or response window. If the daily limit is not set conservatively, the loss is large.

**Fix:**
Consider adding a per-transaction time delay for machine key spends above a threshold (an "anti-frontrunning cooldown"). Alternatively, ensure the velocity freeze is actually functional (fix HIGH-1) to provide an alert signal.

---

### [LOW-1] P256 signature malleability — high-s values may pass if precompile doesn't enforce low-s

**Severity:** LOW
**Category:** Cryptography / Passkey

**Details:**

P256 (secp256r1) signatures are malleable: if `(r, s)` is valid, then `(r, n - s)` is also valid for the same message, where `n` is the curve order. The Base RIP-7212 precompile may accept both forms depending on implementation.

For ERC-4337 governance ops, each UserOp includes a unique nonce in the hash, so malleability cannot enable replay. However, if the same key is used off-chain for other authentication purposes, malleability could matter in those contexts.

The practical ERC-4337 concern: a bundler that has seen a valid `(r, s)` governance signature can produce a second valid form `(r, n-s)` and use it to submit the same UserOp structure — but since the nonce changes between UserOps, this doesn't enable replay of past ops.

**Fix:**
Document the malleability assumption. If the protocol expands passkey signatures to non-nonce-protected contexts, enforce low-s normalization in `_validateP256Signature`.

---

### [LOW-2] `emergencyOwnerOverride` allows instant passkey replacement via compromised EOA

**Severity:** LOW
**Category:** Passkey / Break-Glass

**Details:**

```solidity
function emergencyOwnerOverride(bytes32 newPubKeyX, bytes32 newPubKeyY) external {
    if (msg.sender != owner) revert WAuth();
    // ← No timelock, no guardian notification, instant replacement
    ownerAuth = OwnerAuth({ signerType: SignerType.Passkey, pubKeyX: newPubKeyX, pubKeyY: newPubKeyY });
}
```

If the owner's EOA private key is compromised (while the wallet was using passkey mode for security), the attacker can:
1. Call `emergencyOwnerOverride(attackerPasskeyX, attackerPasskeyY)`.
2. Now all governance UserOps validate against the attacker's P256 key.
3. Attacker submits governance UserOps (setAuthorizedInterceptor, setGuardian, etc.) signed with their passkey.
4. Full governance takeover.

The break-glass mechanism, designed for the legitimate owner to recover from a lost device, becomes a critical pivot point if the EOA is compromised.

**Fix:**
Add a short (e.g., 15-minute) timelock to `emergencyOwnerOverride`, or emit an event that the guardian can monitor and react to. At minimum, `emergencyOwnerOverride` should also notify the guardian (if set) to give a response window.

---

### [LOW-3] Machine key can grief context by cycling open/close, starving legitimate operations

**Severity:** LOW
**Category:** Machine Key / DoS

**Details:**

A compromised or rogue machine key can continuously call `openContext(id, "type")` / `closeContext()` in rapid succession. Since `openContext` checks `if (contextOpen) revert WCtx()`, the key must close before reopening. But a machine key doing this starves legitimate agent operations: any attempt by a legitimate component to open a new context will fail if the malicious key already holds one open.

The owner can always close a maliciously opened context (owner has `onlyOwnerOrMachineKey`), but the key can immediately reopen it. This creates an indefinite griefing loop requiring owner intervention every block.

**Fix:**
Add a `lastContextClosedAt` timestamp and a minimum cooldown before the same key can reopen. Or restrict context opening to owner only (machine keys can only close or work within an existing context).

---

### [LOW-4] `executeTokenSpend` excludes machine keys — inconsistency with `executeSpend`

**Severity:** LOW
**Category:** Authorization / Logic Inconsistency

**Details:**

`executeSpend` (ETH) uses `onlyOwnerOrMachineKey` — machine keys can execute ETH spends autonomously.

`executeTokenSpend` (ERC-20) uses a manual check:
```solidity
if (msg.sender != address(entryPoint) && msg.sender != owner && msg.sender != authorizedInterceptor) revert WAuth();
```

Machine keys are **not** in this list. A machine key authorized to pay for services can execute ETH payments but cannot execute USDC/token payments without going through the interceptor or owner.

If machine keys are intended to support autonomous token-based payments (which they appear to be, given that `attest()` supports token attestations via the `token` parameter), this is a logic gap that would cause unexpected reverts in production.

**Attacker implication:** A machine key that has created a valid token attestation cannot execute it, causing the attestation to expire unused — potentially blocking legitimate payments.

**Fix:**
Add `authorizedMachineKeys[msg.sender]` to the `executeTokenSpend` auth check, or document that machine keys are ETH-only.

---

### [LOW-5] PolicyEngine `spendFrozen` and ARC402Wallet `frozen` are independent — freeze doesn't propagate

**Severity:** LOW
**Category:** Circuit Breaker / Consistency

**Details:**

ARC402Wallet has `frozen` (circuit breaker). PolicyEngine has `spendFrozen[wallet]`. These are entirely independent:

- `frozen = true` (wallet) does NOT set `spendFrozen[wallet] = true` (PolicyEngine).
- `spendFrozen[wallet] = true` (PolicyEngine) does NOT affect `validateUserOp` or `notFrozen` checks in the wallet.

Consequence: A wallet frozen by the guardian via `freeze()` or `freezeAndDrain()` has `wallet.frozen = true`, but PolicyEngine still allows `validateSpend` (until PolicyEngine.spendFrozen is separately set). The `verifyAndConsumeAttestation` path (which only checks PolicyEngine.validateSpend, not wallet.frozen) can still proceed.

Conversely, if PolicyEngine's `freezeSpend` is triggered by a watchtower, the wallet continues accepting UserOps that pass `validateUserOp` (which only checks `wallet.frozen`).

**Fix:**
When `freeze()` or `freezeAndDrain()` is called, also call `policyEngine.freezeSpend(address(this))` to synchronize both freeze states. Reverse on `unfreeze()`.

---

### [INFO-1] CREATE (not CREATE2) factory — wallet addresses are non-deterministic

**Severity:** INFO
**Category:** Factory / UX

Both WalletFactoryV3 and V4 use `CREATE` (factory nonce-based) instead of `CREATE2`. Wallet addresses cannot be pre-computed off-chain before deployment, making it impossible for users to pre-fund or pre-register a wallet address before it exists.

The ERC-4337 ecosystem typically relies on CREATE2 for counterfactual wallet addresses (deploy wallet lazily when the first UserOp arrives). Without CREATE2, wallets must be deployed before any UserOp can reference them.

**Fix:**
Use CREATE2 with a deterministic salt (e.g., keccak256(owner, nonce)) for factory deployments to support ERC-4337 counterfactual deployment patterns.

---

### [INFO-2] `_isGovernanceOp` missing `authorizeMachineKey` and `revokeMachineKey`

**Severity:** INFO
**Category:** ERC-4337 / Defense in Depth

`authorizeMachineKey` and `revokeMachineKey` are `onlyOwner` (not `onlyEntryPointOrOwner`). This means a UserOp targeting these functions would auto-approve in `validateUserOp` but then revert during execution because `msg.sender = entryPoint ≠ owner`. This is safe but confusing: bundlers who simulate a UserOp calling these functions will see validation succeed but execution fail, consuming the deposit.

**Fix:**
Either add these to `_isGovernanceOp` (so validation fails fast if owner sig absent), or change them to `onlyEntryPointOrOwner` so governance ops can be submitted via EntryPoint.

---

### [INFO-3] PolicyEngine contextId deduplication does not prevent cross-wallet reuse

**Severity:** INFO
**Category:** PolicyEngine / Scoping

`_usedContextIds[contextId] = true` is a global mapping, not per-wallet. If wallet A and wallet B both open contexts with the same `contextId`, whichever records a spend first marks that contextId as globally used. The second wallet's `validateSpend` call with the same contextId will fail.

This is unlikely to cause issues in practice (contextIds should be unique per wallet), but it creates an unexpected cross-wallet side effect that could be exploited for grief:
1. Attacker observes wallet A opening context with `contextId = X`.
2. Attacker opens their own wallet with the same `contextId = X` and executes a spend.
3. `_usedContextIds[X] = true` in PolicyEngine.
4. Wallet A's next `validateSpend(X)` fails: "contextId already used".

**Fix:**
Key the deduplication mapping on wallet + contextId: `mapping(address => mapping(bytes32 => bool)) private _usedContextIds`.

---

## Attack Matrix Summary

| Finding | Severity | Funds at Risk | Attacker Precondition | Fix Status |
|---------|----------|--------------|----------------------|-----------|
| CRITICAL-1: executeContractCall auto-approve drain | CRITICAL | 100% ETH+tokens | None (any address) | ✅ FIXED |
| CRITICAL-2: EntryPoint deposit griefing | CRITICAL | EntryPoint deposit | None (any address) | ⚠️ ACCEPTED (by design) |
| HIGH-1: Velocity freeze broken (revert undoes freeze) | HIGH | Up to daily limit | Machine key compromise | ✅ FIXED |
| HIGH-2: verifyAndConsumeAttestation no-frozen check | HIGH | Active attestations | SettlementCoordinator control | ✅ FIXED |
| HIGH-3: setDailyLimitFor bypasses timelock | HIGH | Up to unlimited | Compromised owner EOA | ⚠️ ACCEPTED (scope) |
| MEDIUM-1: Zero contextId disables deduplication | MEDIUM | Up to daily limit | Machine key compromise | ✅ FIXED |
| MEDIUM-2: AttestationId griefing | MEDIUM | None (DoS) | Public, on-chain | ⚠️ ACCEPTED (off-chain entropy) |
| MEDIUM-3: Registry upgrade to malicious registry | MEDIUM | 100% | Compromised owner + 2d wait | ⚠️ ACCEPTED (timelock mitigation) |
| MEDIUM-4: Double initWallet in factory | MEDIUM | None (deployment break) | TrustRegistry impl dependent | ✅ FIXED |
| MEDIUM-5: Machine key drain within daily limit | MEDIUM | Daily limit | Machine key compromise | ✅ PARTIALLY FIXED (velocity freeze now functional; contextId(0) fixed) |
| LOW-1: P256 signature malleability | LOW | None (ERC-4337 nonce prevents replay) | — | ✅ FIXED |
| LOW-2: emergencyOwnerOverride with compromised EOA | LOW | Full governance | Compromised owner EOA | ⚠️ ACCEPTED (break-glass by design) |
| LOW-3: Machine key context griefing | LOW | None (DoS) | Machine key compromise | ⚠️ ACCEPTED (revoke key) |
| LOW-4: executeTokenSpend excludes machine keys | LOW | Token attestation failure | Machine key + token flow | ✅ FIXED |
| LOW-5: Dual freeze state inconsistency | LOW | Residual settlement | Frozen wallet + coordinator | ✅ FIXED |
| INFO-1: CREATE vs CREATE2 | INFO | None | — | ✅ FIXED (documented) |
| INFO-2: machineKey ops not in governance ops | INFO | Gas waste | Any address | ✅ FIXED |
| INFO-3: Cross-wallet contextId collision | INFO | None (DoS) | Any wallet operator | ✅ FIXED |

---

## Priority Remediation Order

1. **CRITICAL-1**: Add `executeContractCall` to `_isGovernanceOp` immediately. This is a zero-day drain vector.
2. **HIGH-2**: Add `notFrozen` + `requireOpenContext` to `verifyAndConsumeAttestation`.
3. **HIGH-1**: Fix velocity freeze by separating the freeze commit from the revert.
4. **MEDIUM-1**: Add `require(contextId != bytes32(0))` to `openContext`.
5. **INFO-3**: Scope `_usedContextIds` to wallet+contextId pair.
6. **HIGH-3**: Add timelock or remove `setDailyLimitFor` in favor of the timelocked flow.
7. **LOW-5**: Synchronize `wallet.frozen` ↔ `PolicyEngine.spendFrozen` on freeze/unfreeze.
8. **MEDIUM-2**: Add `msg.sender` authorization to `IntentAttestation.attest()`.

---

*Generated by adversarial audit pass — 2026-03-18. All findings are from a black-box attacker perspective. Internal references to mitigation PRs pending triage.*

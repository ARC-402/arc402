# Audit Report: Auditor B — Defensive Architect

**Protocol:** ARC-402 (Agent Resource Control)  
**Auditor Role:** Auditor B — Defensive Architect  
**Mandate:** "Does this system hold together? Are the invariants sound? Is the design correct?"  
**Scope:** Cold, independent review — no prior audit findings consulted  
**Date:** 2026-03-11  
**Status:** DRAFT — independent cold review  

---

## Audit Methodology

Read every contract as a systems architect. Searched for:
- State machine correctness (can the system reach an invalid state?)
- Invariant violations (things that should always be true but might not be)
- Access control completeness (every privileged operation properly protected?)
- Design-level flaws (things that work as coded but are wrong by design)
- Integration risks (what can go wrong at the seams between contracts?)
- Missing functionality (what should be here that isn't?)

Contracts reviewed: `ARC402Wallet`, `ARC402Registry`, `PolicyEngine`, `TrustRegistry`, `IntentAttestation`, `SettlementCoordinator`, `WalletFactory`, `X402Interceptor`, `AgentRegistry`, `ServiceAgreement`, all interfaces, and spec docs `00-overview.md` + `08-service-agreement.md`.

---

## Finding B-1: WalletFactory creates permanently bricked wallets

**Severity:** CRITICAL  
**Contract:** WalletFactory.sol / ARC402Wallet.sol  
**Function:** `createWallet()` / constructor  
**Type:** Design Flaw / Invariant Violation  

**Description:**
`WalletFactory.createWallet()` deploys a new `ARC402Wallet` using `new ARC402Wallet(registry)`. Inside `ARC402Wallet`'s constructor, `owner = msg.sender`. When deployed via `new`, `msg.sender` is the **factory contract address**, not the user who called `createWallet()`.

```solidity
// WalletFactory.createWallet()
ARC402Wallet wallet = new ARC402Wallet(registry);  // msg.sender inside = WalletFactory

// ARC402Wallet constructor
constructor(address _registry) {
    owner = msg.sender;  // ← THIS IS THE FACTORY ADDRESS, not the user
```

Compounding this, `owner` is declared `immutable`:
```solidity
address public immutable owner;
```

Immutable means it cannot be changed after construction — ever. There is no `transferOwnership`. So every wallet created through the factory has:
1. `owner == WalletFactory address` (not the user)
2. No mechanism to change the owner to the user
3. All `onlyOwner` functions (`openContext`, `executeSpend`, `freeze`, `setRegistry`, etc.) permanently inaccessible to the user

The `ownerWallets[msg.sender]` mapping in the factory tracks who created the wallet but provides no ownership over it. The factory itself has no functions that delegate `onlyOwner` calls on behalf of users.

**Why this matters:**
The factory is the intended deployment path ("Users call `createWallet()` instead of deploying manually"). Every wallet created through the factory is a dead wallet — unusable by the person who deployed it. This completely breaks the primary user onboarding flow. The protocol's reference implementation factory produces wallets that no one can operate.

**Recommendation:**
Either: (1) Remove `immutable` from `owner` and add a constructor parameter for the intended owner, passing `msg.sender` from the factory: `new ARC402Wallet(registry, msg.sender)`. (2) Or keep `immutable` but add an `initialOwner` constructor parameter and have the factory pass `tx.origin` or the caller address. 

The simplest fix:
```solidity
// ARC402Wallet constructor
constructor(address _registry, address _owner) {
    require(_owner != address(0), "ARC402: zero owner");
    owner = _owner;
    registry = ARC402Registry(_registry);
    _trustRegistry().initWallet(address(this));
}

// WalletFactory.createWallet()
ARC402Wallet wallet = new ARC402Wallet(registry, msg.sender);
```

---

## Finding B-2: PolicyEngine.registerWallet() has no access control

**Severity:** CRITICAL  
**Contract:** PolicyEngine.sol  
**Function:** `registerWallet()`  
**Type:** Access Control  

**Description:**
`registerWallet()` has no authentication check. Anyone can call it with any `wallet` and `owner` address:

```solidity
function registerWallet(address wallet, address owner) external {
    walletOwners[wallet] = owner;  // no msg.sender check, no auth
}
```

The `walletOwners` mapping is used to authorize `setCategoryLimitFor()`:
```solidity
function setCategoryLimitFor(address wallet, string calldata category, uint256 limitPerTx) external {
    require(walletOwners[wallet] == msg.sender || wallet == msg.sender, "PolicyEngine: not authorized");
    categoryLimits[wallet][category] = limitPerTx;
```

An attacker can:
1. Call `registerWallet(victimWallet, attackerAddress)` — overwrites any existing mapping
2. Call `setCategoryLimitFor(victimWallet, "transfers", 0)` — sets all category limits to 0
3. Every spend from `victimWallet` now fails with "category not configured"

This is a **griefing attack** that can block any wallet's policy-governed spending, for any wallet, at zero cost.

**Why this matters:**
An attacker can permanently disable spending for every ARC-402 wallet in the system. The cost is two cheap transactions. There is no recovery path except for the wallet owner to manually reconfigure limits via the wallet itself calling `setCategoryLimit` directly. But ARC402Wallet has no function that calls `PolicyEngine.setCategoryLimit` — the wallet cannot fix this itself. Recovery requires off-chain coordination to redeploy or swap the PolicyEngine.

**Recommendation:**
Restrict `registerWallet` to a known caller — either the wallet itself, the WalletFactory, or an admin role:
```solidity
function registerWallet(address wallet, address owner) external {
    // Only the wallet itself can register (wallet is msg.sender when it calls from constructor/setup)
    require(msg.sender == wallet || isAuthorizedFactory[msg.sender], "PolicyEngine: unauthorized");
    // Additionally: don't allow overwriting existing registrations
    require(walletOwners[wallet] == address(0), "PolicyEngine: already registered");
    walletOwners[wallet] = owner;
}
```

---

## Finding B-3: Velocity limit auto-freeze is broken — revert rolls back the freeze

**Severity:** CRITICAL  
**Contract:** ARC402Wallet.sol  
**Function:** `executeSpend()`, `executeTokenSpend()`  
**Type:** State Machine / Invariant Violation  

**Description:**
The velocity limit logic is intended to auto-freeze the wallet when cumulative spending in the 24h window exceeds `velocityLimit`. The code is:

```solidity
spendingInWindow += amount;
if (velocityLimit > 0 && spendingInWindow > velocityLimit) {
    frozen = true;
    frozenAt = block.timestamp;
    emit WalletFrozen(address(this), "velocity limit exceeded", block.timestamp);
    revert("ARC402: velocity limit exceeded, wallet frozen");
}
```

The `revert()` at the end of this branch **rolls back ALL state changes in the current transaction**, including:
- `spendingInWindow += amount` (reverted → window counter stays at pre-call value)
- `frozen = true` (reverted → wallet is NOT frozen)
- `frozenAt = block.timestamp` (reverted)
- `emit WalletFrozen(...)` (reverted → no audit trail)

The wallet is **never actually frozen**. The current excessive spend is correctly blocked (the spend itself fails), but the wallet continues operating normally on the next call. No audit trail of the velocity breach is recorded on-chain.

**Why this matters:**
The auto-freeze is a critical safety mechanism. Its purpose is: when an agent attempts to spend beyond its velocity limit, treat this as a security event and halt all further spending until an owner manually investigates and unfreezes. This mechanism is completely non-functional. The wallet owner can repeatedly attempt velocity-exceeding spends with each blocked silently, and no freeze ever triggers. All the code signaling "wallet frozen due to velocity" (events, `frozenAt`, `frozenBy` state) produces nothing observable on-chain.

**Recommendation:**
The freeze must be committed in a separate mechanism or the revert must not include the freeze state. One approach:

```solidity
// Option A: Use a flag that survives the revert — not possible with simple state
// Option B: Check BEFORE incrementing; freeze happens on NEXT call if limit exceeded
if (velocityLimit > 0 && spendingInWindow + amount > velocityLimit) {
    frozen = true;
    frozenAt = block.timestamp;
    frozenBy = address(this);  // auto-freeze
    emit WalletFrozen(address(this), "velocity limit exceeded", block.timestamp);
    revert("ARC402: velocity limit exceeded, wallet frozen");
}
// Only update window AFTER the check passes
spendingInWindow += amount;
```

This checks BEFORE updating so that if the spend would exceed the limit, the state change to `spendingInWindow` is already prevented, and `frozen = true` is the only state change. But the revert still undoes `frozen = true`. 

The only real fix: **don't use `revert()` to signal freeze**. Instead, set `frozen = true` and return/emit, without reverting. Or restructure so the freeze state survives the failed spend:

```solidity
// Move velocity check before all other checks so freeze is set before revert:
// OR: use a two-pass design where freeze state is written before the revert path executes
// (which is impossible in a single transaction with revert)
```

The fundamental fix is: pre-check without updating state, revert the spend without changing freeze status:
```solidity
uint256 projectedSpend = (block.timestamp > spendingWindowStart + SPEND_WINDOW) ? amount : spendingInWindow + amount;
if (velocityLimit > 0 && projectedSpend > velocityLimit) {
    // freeze FIRST in a separate call pattern, or redesign as a post-spend check
    frozen = true;
    frozenAt = block.timestamp;
    frozenBy = address(this);
    emit WalletFrozen(address(this), "velocity limit exceeded", block.timestamp);
    revert("ARC402: velocity limit exceeded, wallet frozen");
}
// Now actually update window
if (block.timestamp > spendingWindowStart + SPEND_WINDOW) { ... }
spendingInWindow += amount;
```

Even this has the same problem. The ONLY clean fix is to separate the freeze trigger from the spend failure: either use a two-transaction model, a storage variable committed before the branch, or accept that auto-freeze requires a dedicated call after a failed spend.

---

## Finding B-4: ARC402Registry.update() silently redirects all wallet infrastructure

**Severity:** HIGH  
**Contract:** ARC402Registry.sol  
**Function:** `update()`  
**Type:** Design Flaw / Access Control  

**Description:**
The `ARC402Registry.update()` function allows the registry owner to replace all infrastructure contract addresses (policyEngine, trustRegistry, intentAttestation, settlementCoordinator) in a single atomic call:

```solidity
function update(
    address _policyEngine,
    address _trustRegistry,
    address _intentAttestation,
    address _settlementCoordinator,
    string memory _version
) external onlyOwner {
```

Every wallet that points to this registry immediately begins using the new contracts after this call. The registry's own comment claims: "no phishing/key-compromise path can silently redirect ARC-402 infrastructure" — this is **false**. A compromised registry owner CAN silently redirect all infrastructure for all wallets pointing at the canonical registry.

The opt-out mechanism (wallet owner calls `setRegistry()`) requires users to:
1. Monitor registry changes in real time
2. Have a pre-deployed alternative registry ready
3. Act within the block of the malicious update to prevent any intermediate spends

**Why this matters:**
A single compromised private key (the registry owner) can redirect all wallets to a malicious PolicyEngine that approves all spends, a malicious TrustRegistry that grants maximum trust scores, or a malicious IntentAttestation that validates any attestation. The entire ARC-402 security model collapses on a single key compromise at the registry level.

**Recommendation:**
1. Use Ownable2Step for the registry (consistent with TrustRegistry's design)
2. Add a timelock on `update()` (e.g., 48-hour delay) so wallet owners can observe and react before changes take effect
3. Emit a `RegistryUpdateScheduled` event at timelock start so wallets can detect and opt out
4. Consider making individual contract addresses independently upgradeable so a single botched update doesn't atomically replace all infrastructure

---

## Finding B-5: SettlementCoordinator.propose() has no fromWallet authorization

**Severity:** HIGH  
**Contract:** SettlementCoordinator.sol  
**Function:** `propose()`  
**Type:** Access Control  

**Description:**
The `propose()` function accepts `fromWallet` as a parameter without verifying that `msg.sender == fromWallet`:

```solidity
function propose(
    address fromWallet,
    address toWallet,
    uint256 amount,
    address token,
    bytes32 intentId,
    uint256 expiresAt
) external returns (bytes32 proposalId) {
    // No require(msg.sender == fromWallet, ...)
```

Anyone can create a settlement proposal specifying any wallet as the `fromWallet`. The `execute()` function does enforce `msg.sender == p.fromWallet`, so funds cannot be drained without the victim wallet's cooperation — **but** an automated agent wallet that naively executes all ACCEPTED proposals for its address could be tricked into executing fraudulent settlements.

**Why this matters:**
In an automated multi-agent system where wallet controllers respond to on-chain events (a reasonable design assumption for ARC-402), an attacker can:
1. Create a proposal: `fromWallet = victimWallet`, `toWallet = attackerWallet`
2. Accept it from the attacker's wallet (which IS `toWallet`)
3. Proposal is now in `ACCEPTED` state for `victimWallet`
4. If the victim wallet's automation layer calls `execute()` on ACCEPTED proposals without verifying it originated them, funds transfer to the attacker

Additionally, this creates proposal spam — anyone can flood the coordinator with fake proposals attributed to any wallet.

**Recommendation:**
```solidity
function propose(...) external returns (bytes32 proposalId) {
    require(msg.sender == fromWallet, "SettlementCoordinator: caller is not fromWallet");
    // ...
```

---

## Finding B-6: TrustRegistry: wallets are not authorized updaters — core wallet functions permanently broken

**Severity:** HIGH  
**Contract:** TrustRegistry.sol / ARC402Wallet.sol  
**Function:** `recordSuccess()`, `recordAnomaly()`, `closeContext()`, `executeSpend()`  
**Type:** Integration Risk / Missing Feature  

**Description:**
`TrustRegistry.recordSuccess()` and `recordAnomaly()` are guarded by `onlyUpdater`:

```solidity
modifier onlyUpdater() {
    require(isAuthorizedUpdater[msg.sender], "TrustRegistry: not authorized updater");
    _;
}
function recordSuccess(address wallet) external onlyUpdater { ... }
function recordAnomaly(address wallet) external onlyUpdater { ... }
```

`ARC402Wallet` calls these directly from two places:

```solidity
// closeContext() — called every time a task successfully completes
_trustRegistry().recordSuccess(address(this));

// executeSpend() / executeTokenSpend() — called on policy rejection
_trustRegistry().recordAnomaly(address(this));
```

For `recordSuccess`/`recordAnomaly` to succeed, `address(this)` (the wallet itself) must be in `isAuthorizedUpdater`. But **nowhere in the codebase** is a wallet ever added as an authorized updater:
- `WalletFactory.createWallet()` calls `initWallet()` but NOT `addUpdater()`
- `ARC402Wallet` constructor calls `initWallet()` but NOT `addUpdater()`
- `TrustRegistry` constructor only adds `msg.sender` (the deployer) as an updater

**Consequences:**
1. Every call to `closeContext()` reverts with "TrustRegistry: not authorized updater"
2. Every policy rejection in `executeSpend()` reverts with the same error instead of the policy reason — the caller sees a confusing auth error rather than "PolicyEngine: amount exceeds category limit"
3. Trust scores for wallets can never be updated via wallet actions
4. The `recordAnomaly` call on a policy failure blocks the clean error path, making debugging hard

**Why this matters:**
`closeContext()` is a core lifecycle function — called at the end of every successful task. It is permanently broken for all wallets in any standard deployment. The trust feedback loop (successes increment score, anomalies decrement) is silently non-functional.

**Recommendation:**
During wallet initialization, add the wallet as an authorized updater:

```solidity
// In WalletFactory.createWallet() or ARC402Wallet constructor:
ITrustRegistry(reg.trustRegistry()).addUpdater(address(wallet));
```

This requires `WalletFactory` to have the ability to call `addUpdater`, which means `WalletFactory` must be trusted by `TrustRegistry`. Consider a dedicated `initWalletFull(address wallet)` function on TrustRegistry that combines `initWallet + addUpdater` and can only be called by an authorized factory.

---

## Finding B-7: proposeMASSettlement is a stub — not connected to SettlementCoordinator

**Severity:** HIGH  
**Contract:** ARC402Wallet.sol / SettlementCoordinator.sol  
**Function:** `proposeMASSettlement()`  
**Type:** Design Flaw / Integration Risk  

**Description:**
`ARC402Wallet.proposeMASSettlement()` validates a spend and emits an event, but **never calls SettlementCoordinator**:

```solidity
function proposeMASSettlement(
    address recipientWallet,
    uint256 amount,
    string calldata category,
    bytes32 attestationId
) external onlyOwner requireOpenContext {
    require(_intentAttestation().verify(...), ...);
    (bool valid, string memory reason) = _policyEngine().validateSpend(...);
    require(valid, reason);
    emit SettlementProposed(recipientWallet, amount, attestationId);
    // ← NO call to SettlementCoordinator.propose()
    // ← NO fund locking
    // ← NO state change in the coordinator
}
```

The SettlementCoordinator has its own `propose()` function that must be called separately (and which has no access control — see B-5). The two are semantically disconnected. The emitted `SettlementProposed` event creates the illusion of a governed settlement initiation, but nothing is locked and the coordinator doesn't know this happened.

**Why this matters:**
Multi-Agent Settlement is described as a core ARC-402 primitive ("Agent-to-agent is native"). The supposed governance layer for MAS (policy check + attestation) in `proposeMASSettlement` is decoupled from the actual settlement mechanics. The SettlementCoordinator can be used entirely without any governance — anyone can call `SettlementCoordinator.propose()` directly, bypassing all ARC-402 policy.

**Recommendation:**
`proposeMASSettlement` should directly invoke `SettlementCoordinator.propose()` and return the `proposalId`:

```solidity
function proposeMASSettlement(
    address recipientWallet,
    uint256 amount,
    address token,
    string calldata category,
    bytes32 attestationId,
    uint256 expiresAt
) external onlyOwner requireOpenContext notFrozen returns (bytes32 proposalId) {
    require(_intentAttestation().verify(attestationId, address(this)), ...);
    (bool valid, string memory reason) = _policyEngine().validateSpend(...);
    require(valid, reason);
    
    ISettlementCoordinator coordinator = ISettlementCoordinator(registry.settlementCoordinator());
    proposalId = coordinator.propose(address(this), recipientWallet, amount, token, attestationId, expiresAt);
    emit SettlementProposed(recipientWallet, amount, attestationId, proposalId);
}
```

---

## Finding B-8: ServiceAgreement DISPUTED state has no timeout — permanent fund lockup

**Severity:** HIGH  
**Contract:** ServiceAgreement.sol  
**Function:** `dispute()`, `resolveDispute()`  
**Type:** State Machine / Design Flaw  

**Description:**
Once a `dispute()` is raised, the only exit from `DISPUTED` state is `resolveDispute()` called by the owner:

```solidity
function resolveDispute(uint256 agreementId, bool favorProvider) external onlyOwner nonReentrant {
    Agreement storage ag = _get(agreementId);
    require(ag.status == Status.DISPUTED, "ServiceAgreement: not DISPUTED");
    // ...
}
```

There is no timeout. If the owner:
- Loses their private key
- Becomes unresponsive
- Is compromised and acts maliciously (refusing to resolve)

Then all funds in DISPUTED agreements are permanently locked in the contract with no recourse for either party. The spec acknowledges centralized resolution as a v1 tradeoff but does not mention the absence of a timeout as a risk.

**Why this matters:**
Given that dispute resolution is a single owner key (not even a multisig by default), the risk of permanent fund lockup is non-trivial. A single key compromise that results in the owner refusing to call `resolveDispute` locks all disputed escrow forever. At scale, this could lock significant value.

**Recommendation:**
Add a `disputeTimeout` (e.g., 30 days) after which either party can trigger a default resolution:

```solidity
uint256 public constant DISPUTE_TIMEOUT = 30 days;

function timeoutDispute(uint256 agreementId) external nonReentrant {
    Agreement storage ag = _get(agreementId);
    require(ag.status == Status.DISPUTED, "ServiceAgreement: not DISPUTED");
    require(block.timestamp > ag.resolvedAt + DISPUTE_TIMEOUT || 
            block.timestamp > ag.deadline + DISPUTE_TIMEOUT,
            "ServiceAgreement: dispute not timed out");
    // Default: refund client (conservative default favors payer)
    ag.status = Status.CANCELLED;
    ag.resolvedAt = block.timestamp;
    _releaseEscrow(ag.token, ag.client, ag.price);
    emit DisputeResolved(agreementId, false); // or a new TimedOutDisputeResolved event
}
```

---

## Finding B-9: IntentAttestation has no single-use protection — one attestation validates unlimited spends

**Severity:** HIGH  
**Contract:** IntentAttestation.sol / ARC402Wallet.sol  
**Function:** `attest()`, `verify()`, `executeSpend()`  
**Type:** Design Flaw / Invariant Violation  

**Description:**
`verify()` only checks that an attestation exists and belongs to the calling wallet:

```solidity
function verify(bytes32 attestationId, address wallet) external view returns (bool) {
    return exists[attestationId] && attestations[attestationId].wallet == wallet;
}
```

There is no tracking of whether an attestationId has already been used in a spend. The same `attestationId` can be passed to `executeSpend()` or `executeTokenSpend()` repeatedly, and `verify()` will return `true` each time.

Additionally, the attestation's stored fields (recipient, amount, token) are **not validated** against the actual spend parameters in `executeSpend`:

```solidity
// executeSpend only checks that attestation exists and belongs to this wallet
// Does NOT check: attestation.recipient == recipient
//                 attestation.amount == amount
//                 attestation.token == address(0) (ETH)
require(_intentAttestation().verify(attestationId, address(this)), "ARC402: invalid intent attestation");
```

**Why this matters:**
The entire purpose of IntentAttestation is to create an immutable pre-spend record of intent for each spend action. Without single-use protection:
1. A wallet owner can create one attestation and execute unlimited spends with it — the audit trail is meaningless
2. The "Intent is auditable" design principle (#4 in spec) is violated: on-chain records show one attestation for many spends
3. The stored amount/recipient in the attestation can differ completely from the actual spend — an attestation of "0.01 ETH to vendor" covers a "100 ETH to unknown" spend equally

**Recommendation:**
1. Track used attestations:
```solidity
mapping(bytes32 => bool) private used;

function markUsed(bytes32 attestationId) external {
    require(exists[attestationId] && attestations[attestationId].wallet == msg.sender, "not owner");
    require(!used[attestationId], "already used");
    used[attestationId] = true;
}

function verify(bytes32 attestationId, address wallet) external view returns (bool) {
    return exists[attestationId] && !used[attestationId] && attestations[attestationId].wallet == wallet;
}
```

2. Validate spend parameters against attestation fields in `executeSpend`:
```solidity
Attestation storage a = _intentAttestation().getAttestation(attestationId);
require(a.recipient == recipient, "ARC402: attestation recipient mismatch");
require(a.amount == amount, "ARC402: attestation amount mismatch");
require(a.token == address(0), "ARC402: attestation token mismatch");
```

---

## Finding B-10: X402Interceptor has no access control — exposes wallet to unrestricted public spend calls

**Severity:** HIGH  
**Contract:** X402Interceptor.sol  
**Function:** `executeX402Payment()`  
**Type:** Access Control / Design Flaw  

**Description:**
`executeX402Payment()` has no `msg.sender` restriction:

```solidity
function executeX402Payment(
    address recipient,
    uint256 amount,
    bytes32 attestationId,
    string calldata requestUrl
) external {
    IARC402Wallet(arc402Wallet).executeTokenSpend(...);
    emit X402PaymentExecuted(recipient, amount, attestationId, requestUrl);
}
```

`executeTokenSpend` on the wallet requires `msg.sender == owner`. For this to work, `X402Interceptor` must be the wallet's `owner`. If the interceptor is the owner, then **any caller** of `executeX402Payment` can trigger token spends from the wallet (subject to context and attestation checks), without any authentication of who initiated the x402 payment.

**Why this matters:**
The X402 payment flow is: agent receives HTTP 402 → agent calls this function. But anyone can call this function with any `attestationId` and `recipient`. If:
- A context is currently open (required for `executeTokenSpend`)
- A valid attestationId exists (and single-use isn't enforced — see B-9)
- The policy category "api_call" has a non-zero limit

...then any external party can drain the wallet up to the "api_call" category limit per transaction. The fact that `X402Interceptor` must be the wallet owner to work creates a privileged contract with no access controls — a critical architectural mistake.

**Recommendation:**
Add caller authentication. The interceptor should only accept calls from the wallet owner or a known agent runtime:

```solidity
address public immutable walletOwner;

constructor(address _arc402Wallet, address _usdcToken) {
    arc402Wallet = _arc402Wallet;
    usdcToken = _usdcToken;
    walletOwner = IARC402Wallet(_arc402Wallet).owner();
}

function executeX402Payment(...) external {
    require(msg.sender == walletOwner, "X402: not wallet owner");
    // ...
}
```

---

## Finding B-11: PolicyEngine validateSpend ignores contextId, policyId, and stored policyData

**Severity:** MEDIUM  
**Contract:** PolicyEngine.sol  
**Function:** `validateSpend()`  
**Type:** Design Flaw / Missing Feature  

**Description:**
The spec defines Policy and Context as first-class primitives. The wallet tracks `activePolicyId` and `activeContextId`. Both are passed to `validateSpend`. But the implementation explicitly ignores both:

```solidity
function validateSpend(
    address wallet,
    string calldata category,
    uint256 amount,
    bytes32 /*contextId*/  // ← explicitly discarded
) external view returns (bool valid, string memory reason) {
    uint256 limit = categoryLimits[wallet][category];
    // ← activePolicyId never passed, never checked
    // ← stored policyData (set via setPolicy()) never consulted
```

Additionally, `setPolicy()` stores `policyHash` and `policyData` bytes, but these are never read in `validateSpend`. The policy data field is effectively dead code in the current implementation.

**Why this matters:**
1. The wallet's `activePolicyId` has no on-chain effect — it can be set to anything and nothing changes
2. Context-aware spending ("spending authority is task-aware") is described as a core ARC-402 differentiator. The implementation reduces to a flat per-category limit with no context awareness
3. The stored policy data (potentially encoding complex rules) is silently ignored

**Recommendation:**
The PolicyEngine needs a real policy evaluation model. At minimum:
- Use `activePolicyId` to look up the wallet's configured policy
- Enforce that `contextId` matches an allowed context for the spend category
- Interpret `policyData` (even if it's a simple ABI-encoded struct of limits per context type)

---

## Finding B-12: proposeMASSettlement missing notFrozen modifier

**Severity:** MEDIUM  
**Contract:** ARC402Wallet.sol  
**Function:** `proposeMASSettlement()`  
**Type:** State Machine / Access Control  

**Description:**
`executeSpend()` and `executeTokenSpend()` both include `notFrozen` in their modifiers. `proposeMASSettlement()` does not:

```solidity
// executeSpend: onlyOwner requireOpenContext notFrozen ✓
// executeTokenSpend: onlyOwner requireOpenContext notFrozen ✓
// proposeMASSettlement: onlyOwner requireOpenContext ← missing notFrozen
function proposeMASSettlement(
    address recipientWallet,
    uint256 amount,
    string calldata category,
    bytes32 attestationId
) external onlyOwner requireOpenContext {
```

A frozen wallet can still call `proposeMASSettlement`, emit `SettlementProposed`, and (once B-7 is fixed) create binding proposals in SettlementCoordinator.

**Why this matters:**
The freeze is a safety mechanism to halt all spending commitments. A frozen wallet making new settlement proposals violates the invariant: "a frozen wallet makes no financial commitments." If a velocity breach or manual freeze is the trigger, the wallet should not be creating new downstream obligations.

**Recommendation:**
Add `notFrozen`:
```solidity
function proposeMASSettlement(...) external onlyOwner requireOpenContext notFrozen {
```

---

## Finding B-13: Velocity limit accumulates ETH and ERC-20 token amounts in the same counter

**Severity:** MEDIUM  
**Contract:** ARC402Wallet.sol  
**Function:** `executeSpend()`, `executeTokenSpend()`  
**Type:** Design Flaw / Invariant Violation  

**Description:**
The velocity window counter `spendingInWindow` is shared between ETH and ERC-20 token spends. Both `executeSpend` (ETH, in wei) and `executeTokenSpend` (ERC-20, e.g. USDC with 6 decimals) increment the same counter:

```solidity
// In executeSpend (ETH):
spendingInWindow += amount;  // amount in wei (e.g., 1e18 = 1 ETH)

// In executeTokenSpend (e.g., USDC):
spendingInWindow += amount;  // amount in USDC units (e.g., 1e6 = 1 USDC)
```

If `velocityLimit` is set in USDC units (e.g., `1_000_000_000` = 1,000 USDC), then a single 1 ETH spend (`1e18` wei) will overflow the counter by orders of magnitude, triggering the limit immediately (though the freeze mechanism is broken — see B-3). Conversely, if set in ETH units, USDC spends would barely register.

**Why this matters:**
The velocity limit is incoherent when mixed token types are used. An operator setting limits in USDC units inadvertently allows unlimited ETH spending (each ETH spend reverts before reaching the check), and vice versa. There is no correct single value for `velocityLimit` if both ETH and ERC-20 are used.

**Recommendation:**
Separate velocity tracking per token:
```solidity
mapping(address => uint256) public spendingInWindowByToken;
mapping(address => uint256) public velocityLimitByToken;
// address(0) = ETH
```

---

## Finding B-14: ServiceAgreement uses single-step ownership transfer (inconsistent with TrustRegistry)

**Severity:** MEDIUM  
**Contract:** ServiceAgreement.sol  
**Function:** `transferOwnership()`  
**Type:** Design Flaw / Access Control  

**Description:**
`ServiceAgreement` implements its own single-step ownership transfer:
```solidity
function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "ServiceAgreement: zero address");
    address old = owner;
    owner = newOwner;
    emit OwnershipTransferred(old, newOwner);
}
```

`TrustRegistry` correctly uses OpenZeppelin's `Ownable2Step` which requires the new owner to explicitly accept. The `ServiceAgreement` owner has unilateral power over all dispute resolutions — a far more sensitive role than the TrustRegistry owner. Using single-step transfer is inconsistent and higher risk: a phishing attack on the current owner can permanently transfer dispute resolution power to an attacker in a single signed transaction.

**Why this matters:**
The dispute resolution owner controls all locked escrow in disputed agreements. This role is at least as sensitive as the TrustRegistry owner (which uses 2-step), yet has weaker protection.

**Recommendation:**
Replace with OpenZeppelin `Ownable2Step`:
```solidity
import "@openzeppelin/contracts/access/Ownable2Step.sol";
contract ServiceAgreement is IServiceAgreement, ReentrancyGuard, Ownable2Step {
    constructor(address _trustRegistry) Ownable(msg.sender) { ... }
}
```

---

## Finding B-15: IntentAttestation has no expiry — stale attestations remain valid forever

**Severity:** MEDIUM  
**Contract:** IntentAttestation.sol  
**Function:** `verify()`  
**Type:** Design Flaw  

**Description:**
Attestations are permanent and have no expiry mechanism. An attestation created months ago remains valid indefinitely. There is no way to revoke an attestation:

```solidity
function verify(bytes32 attestationId, address wallet) external view returns (bool) {
    return exists[attestationId] && attestations[attestationId].wallet == wallet;
    // No timestamp check, no expiry, no revocation
}
```

**Why this matters:**
1. If a wallet is compromised and later recovered, old attestations from the compromised period remain permanently usable
2. Attestations created for a specific task context remain valid even after the context is closed and a new one opened
3. Combined with the single-use issue (B-9), a long-expired attestation can authorize current spends with no temporal guard

**Recommendation:**
Add an expiry to attestations and enforce it in `verify`:
```solidity
struct Attestation {
    // ...existing fields...
    uint256 expiresAt;  // 0 = never expires
}

function verify(bytes32 attestationId, address wallet) external view returns (bool) {
    if (!exists[attestationId]) return false;
    Attestation storage a = attestations[attestationId];
    if (a.wallet != wallet) return false;
    if (a.expiresAt > 0 && block.timestamp > a.expiresAt) return false;
    return true;
}
```

---

## Finding B-16: Missing reentrancy guard on executeSpend and executeTokenSpend

**Severity:** MEDIUM  
**Contract:** ARC402Wallet.sol  
**Function:** `executeSpend()`, `executeTokenSpend()`  
**Type:** State Machine  

**Description:**
Both `executeSpend()` and `executeTokenSpend()` perform external calls (ETH transfer via `recipient.call{value:}`, ERC-20 transfer via `safeTransfer`) after state updates. Neither function is guarded by `nonReentrant`.

The wallet's `onlyOwner` modifier limits calls to the owner. If the owner is a smart contract (common in ERC-4337 account abstraction context), the ETH recipient could re-enter `executeSpend` during the transfer. While the velocity window is updated before the external call (CEI-ish), the context is still open, the attestation is still considered valid (no single-use), and another spend can proceed.

The comment says "emit before external call per CEI pattern" — but emitting an event before the external call does NOT satisfy CEI for reentrancy protection. Events are not state that guards against re-entry.

**Why this matters:**
In the anticipated ERC-4337 usage pattern, smart contract wallets are the norm. A malicious recipient in an ETH spend can re-enter the wallet to execute a second spend within the same context.

**Recommendation:**
Import and apply `ReentrancyGuard`:
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
contract ARC402Wallet is ReentrancyGuard {
    function executeSpend(...) external onlyOwner requireOpenContext notFrozen nonReentrant {
    function executeTokenSpend(...) external onlyOwner requireOpenContext notFrozen nonReentrant {
```

---

## Finding B-17: Client trust score not updated for spurious disputes in ServiceAgreement

**Severity:** MEDIUM  
**Contract:** ServiceAgreement.sol  
**Function:** `resolveDispute()`  
**Type:** Design Flaw / Missing Feature  

**Description:**
When `resolveDispute(true)` (provider wins), only the provider's trust score is updated (recordSuccess). When `resolveDispute(false)` (client wins), the provider gets `recordAnomaly`. But the **client's** trust score is never penalized for frivolous disputes:

```solidity
if (favorProvider) {
    // ...
    ITrustRegistry(trustRegistry).recordSuccess(ag.provider);
    // ← No recordAnomaly for client (who raised frivolous dispute)
} else {
    // ...
    ITrustRegistry(trustRegistry).recordAnomaly(ag.provider);
    // ← No recordSuccess for client
}
```

The spec explicitly identifies "dispute spam" as a known attack vector and acknowledges "spurious disputes by a client will appear in the client's on-chain record and SHOULD be factored into the client's trust score." But the code never records anything for the client.

**Why this matters:**
Without client trust score penalties, disputing is free. A client can force all providers into DISPUTED state (blocking payment) at zero cost. This is a griefing attack on the provider ecosystem.

**Recommendation:**
```solidity
if (favorProvider) {
    ag.status = Status.FULFILLED;
    _releaseEscrow(ag.token, ag.provider, ag.price);
    if (trustRegistry != address(0)) {
        ITrustRegistry(trustRegistry).recordSuccess(ag.provider);
        ITrustRegistry(trustRegistry).recordAnomaly(ag.client);  // frivolous dispute
    }
} else {
    ag.status = Status.CANCELLED;
    _releaseEscrow(ag.token, ag.client, ag.price);
    if (trustRegistry != address(0)) {
        ITrustRegistry(trustRegistry).recordAnomaly(ag.provider);
        ITrustRegistry(trustRegistry).recordSuccess(ag.client);  // legitimate dispute
    }
}
```

---

## Finding B-18: TrustRegistry.initWallet() has no access control

**Severity:** LOW  
**Contract:** TrustRegistry.sol  
**Function:** `initWallet()`  
**Type:** Access Control  

**Description:**
`initWallet()` is callable by anyone with no authentication:
```solidity
function initWallet(address wallet) external {
    if (!initialized[wallet]) {
        initialized[wallet] = true;
        scores[wallet] = INITIAL_SCORE;
```

While the function is idempotent (only sets score if not already initialized), anyone can initialize any wallet to score 100 before the legitimate deployment. Since 100 is the intended initial score, this is harmless today but represents unexpected open access. A future change to INITIAL_SCORE semantics could make this dangerous.

**Recommendation:**
Add `onlyUpdater` or restrict to a factory/trusted-setup role:
```solidity
function initWallet(address wallet) external onlyUpdater {
```

---

## Finding B-19: X402Interceptor hard-codes "api_call" category

**Severity:** LOW  
**Contract:** X402Interceptor.sol  
**Function:** `executeX402Payment()`  
**Type:** Design Flaw  

**Description:**
The payment category is hard-coded:
```solidity
IARC402Wallet(arc402Wallet).executeTokenSpend(
    usdcToken,
    recipient,
    amount,
    "api_call",  // ← immutable
    attestationId
);
```

If a wallet's PolicyEngine has no "api_call" category configured (or uses different category names), all X402 payments will fail with "PolicyEngine: category not configured". There is no way to change the category without redeploying the interceptor.

**Recommendation:**
Make category configurable:
```solidity
string public category;
constructor(address _arc402Wallet, address _usdcToken, string memory _category) {
    // ...
    category = _category;
}
```

---

## Finding B-20: frozenBy not populated in auto-freeze path

**Severity:** LOW  
**Contract:** ARC402Wallet.sol  
**Function:** `executeSpend()`, `executeTokenSpend()`  
**Type:** State Machine / Invariant Violation  

**Description:**
Manual freeze correctly sets `frozenBy`:
```solidity
function freeze(string calldata reason) external onlyOwner {
    frozen = true;
    frozenAt = block.timestamp;
    frozenBy = msg.sender;  // ← set
```

But velocity limit auto-freeze does not (note: the auto-freeze is also broken per B-3, but assuming it were fixed):
```solidity
if (velocityLimit > 0 && spendingInWindow > velocityLimit) {
    frozen = true;
    frozenAt = block.timestamp;
    // frozenBy ← NOT set (remains address(0) or old value)
    emit WalletFrozen(address(this), "velocity limit exceeded", block.timestamp);
```

After an auto-freeze, `frozenBy == address(0)`, giving no indication that the freeze was automatic.

**Recommendation:**
```solidity
frozenBy = address(this);  // sentinel for auto-freeze
```

---

## Finding B-21: Context ID has no uniqueness enforcement

**Severity:** LOW  
**Contract:** ARC402Wallet.sol  
**Function:** `openContext()`  
**Type:** Design Flaw  

**Description:**
`openContext()` accepts any `contextId` without checking if it has been used before:
```solidity
function openContext(bytes32 contextId, string calldata taskType) external onlyOwner {
    require(!contextOpen, "ARC402: context already open");
    activeContextId = contextId;
```

The same `contextId` can be reused across multiple separate tasks. Since attestations are linked to a wallet (not a specific context), old attestations created during a previous context with the same ID can be reused in the new context. This undermines the auditability of per-context spending.

**Recommendation:**
Track used context IDs and reject reuse:
```solidity
mapping(bytes32 => bool) public usedContextIds;

function openContext(bytes32 contextId, string calldata taskType) external onlyOwner {
    require(!contextOpen, "ARC402: context already open");
    require(!usedContextIds[contextId], "ARC402: contextId already used");
    usedContextIds[contextId] = true;
    // ...
}
```

---

## Finding B-22: AgentRegistry wallet field represents EOA caller, not ARC-4337 wallet

**Severity:** LOW  
**Contract:** AgentRegistry.sol  
**Function:** `register()`  
**Type:** Design Flaw / Integration Risk  

**Description:**
`register()` assigns `info.wallet = msg.sender`. In an ERC-4337 account abstraction context, agents are typically controlled by smart contract wallets. An agent might register through its EOA owner (`msg.sender`) but their actual wallet address (the ARC402Wallet contract) is different. The `AgentInfo.wallet` field would then contain the owner EOA, not the agent wallet.

This creates a disconnect: the AgentRegistry and the ARC402Wallet/TrustRegistry would have different addresses for the same agent, making cross-contract lookups unreliable.

**Recommendation:**
Allow registrants to specify the wallet address explicitly:
```solidity
function register(
    address walletAddress,  // the ARC402Wallet contract address
    string calldata name,
    // ...
) external override {
    require(walletAddress != address(0), "AgentRegistry: zero wallet");
    // Optionally: verify msg.sender is owner of walletAddress
    info.wallet = walletAddress;  // store the actual wallet
```

---

## Finding B-23: Immutable owner provides no key recovery path

**Severity:** INFO  
**Contract:** ARC402Wallet.sol  
**Function:** constructor  
**Type:** Design Flaw  

**Description:**
`owner` is `immutable`. If the owner loses their private key, the wallet is permanently lost — all funds are locked and all ARC-402 primitives are inaccessible. There is no recovery mechanism (no guardian, no social recovery, no timelock override).

The design choice is intentional (prevents phishing/key-compromise path to silently redirect the wallet). This is a legitimate security tradeoff for a reference implementation, but it creates a usability risk in production.

**Why this matters:**
For an agentic system expected to hold funds, zero key recovery is a production risk. This should be explicitly documented as a deployment consideration.

**Recommendation:**
Document this explicitly and recommend that production implementations use a guardian scheme (ERC-4337 compatible), a multisig owner, or a hardware-key-backed EOA. For the reference implementation, consider adding an optional `guardian` address that can trigger a `pause` (not ownership transfer) but not redirect funds.

---

## Finding B-24: SettlementCoordinator not included in ARC402Registry

**Severity:** INFO  
**Contract:** ARC402Registry.sol / SettlementCoordinator.sol  
**Function:** system-level  
**Type:** Integration Risk  

**Description:**
`ARC402Registry` tracks `settlementCoordinator` as an address field, but `ARC402Wallet` never reads `registry.settlementCoordinator()`. The wallet has no internal accessor `_settlementCoordinator()` (unlike `_policyEngine()`, `_trustRegistry()`, `_intentAttestation()`). The `proposeMASSettlement` function (even if fixed per B-7) would need this.

**Recommendation:**
Add the accessor and use it:
```solidity
function _settlementCoordinator() internal view returns (ISettlementCoordinator) {
    return ISettlementCoordinator(registry.settlementCoordinator());
}
```

---

## Finding B-25: PolicyEngine.setCategoryLimit callable by wallet contract itself — but wallet has no such function

**Severity:** INFO  
**Contract:** PolicyEngine.sol / ARC402Wallet.sol  
**Function:** `setCategoryLimit()`, `setCategoryLimitFor()`  
**Type:** Design Flaw  

**Description:**
`setCategoryLimit()` allows `msg.sender` to set limits for themselves. `setCategoryLimitFor()` allows an address to set limits if `wallet == msg.sender`. Both paths are intended to allow the wallet itself to self-configure. But `ARC402Wallet` has no function that calls either method on the PolicyEngine. There is no `configurePolicy(string category, uint256 limit)` function on the wallet. The wallet owner would need to call PolicyEngine directly, which works, but is not the intended governance pattern.

**Recommendation:**
Add a delegation function to `ARC402Wallet`:
```solidity
function setCategoryLimit(string calldata category, uint256 limitPerTx) external onlyOwner {
    _policyEngine().setCategoryLimit(category, limitPerTx);
}
```

---

## Summary

- **CRITICAL:** 3
- **HIGH:** 7
- **MEDIUM:** 7
- **LOW:** 5
- **INFO:** 3

---

## Key architectural observations:

- **The factory is broken by design.** `WalletFactory` is the primary onboarding path, but it creates wallets that are permanently owned by the factory contract itself (not the user) due to `owner = msg.sender` in an `immutable` field. This is the single most impactful finding: the reference implementation's primary deployment tool produces unusable wallets.

- **Trust score integration is wired but not connected.** `ARC402Wallet` calls `recordSuccess` and `recordAnomaly` on the TrustRegistry, but wallets are never added as authorized updaters. These calls will always revert in production. The trust feedback loop — a core ARC-402 primitive — silently doesn't work.

- **The intent attestation model is mostly theatre.** Attestations are permanent, reusable, parameter-unchecked, and never expire. A single attestation created once validates unlimited spends of any amount to any recipient. The "Intent is auditable" design principle is claimed but not enforced.

- **Multi-Agent Settlement is architecturally disconnected.** `proposeMASSettlement` emits an event but doesn't call the coordinator. The SettlementCoordinator has no access controls and no connection to governance primitives. MAS as described in the spec does not exist in the implementation — the two components are parallel, not integrated.

- **Safety mechanisms revert their own effects.** The velocity limit auto-freeze is completely negated by the `revert()` that immediately follows `frozen = true` — Solidity's transaction atomicity rolls back the freeze along with the failed spend. The safety net that was supposed to halt a wallet on suspicious behavior is structurally inoperable.

---

## Top 3 findings:

1. **B-1** — WalletFactory creates permanently bricked wallets (owner is factory due to `owner = msg.sender` + `immutable` — primary user onboarding path is completely broken)
2. **B-3** — Velocity limit auto-freeze is self-defeating: `revert()` rolls back `frozen = true`, so the wallet is never actually frozen on velocity breach (safety mechanism is inoperable)
3. **B-6** — TrustRegistry: wallets are not authorized updaters, so `closeContext()` always reverts and policy failures produce misleading auth errors instead of policy reasons (core lifecycle function is permanently broken in standard deployments)

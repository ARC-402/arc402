# Spec 27 — Freeze Guardian + Policy Enforcement Audit

**Status:** QUEUED  
**Priority:** LAUNCH BLOCKER — must ship before mainnet  
**Rationale:** The freeze guardian enables AI-initiated emergency response without compromising owner control. The policy audit closes the approve() and batch call bypass vectors that could let the hot key exceed its intended limits.

---

## Overview

Two deliverables:

1. **Freeze guardian in ARC402Wallet** — a secondary address that can ONLY call `freeze()`. The AI holds this key. If it detects an emergency, it can freeze instantly without human approval. Only the owner (phone wallet) can unfreeze.

2. **Policy enforcement audit** — targeted review and hardening of the PolicyEngine enforcement logic against `approve()` bypass, batch call sequences, and token-specific edge cases.

---

## Deliverable 1: Freeze Guardian

### Contract Changes: contracts/ARC402Wallet.sol

Add to state variables:
```solidity
address public guardian;
bool public frozen;

event Frozen(address indexed by);
event Unfrozen(address indexed by);
event GuardianUpdated(address indexed newGuardian);
```

Add modifier:
```solidity
modifier notFrozen() {
    require(!frozen, "ARC402Wallet: wallet is frozen");
    _;
}
```

Apply to all executing functions:
```solidity
function execute(address to, uint256 value, bytes calldata data)
    external payable
    nonReentrant
    notFrozen  // ← add this
    returns (bytes memory) { ... }
```

Add guardian functions:
```solidity
/// @notice Emergency freeze. Can only be called by guardian.
/// Guardian is the AI agent's designated emergency key.
/// Guardian cannot unfreeze — only owner can.
function freeze() external {
    require(msg.sender == guardian, "ARC402Wallet: not guardian");
    frozen = true;
    emit Frozen(msg.sender);
}

/// @notice Unfreeze. Only owner can unfreeze.
function unfreeze() external {
    require(msg.sender == owner, "ARC402Wallet: not owner");
    frozen = false;
    emit Unfrozen(msg.sender);
}

/// @notice Update guardian address. Only owner can change guardian.
function setGuardian(address _guardian) external {
    require(msg.sender == owner, "ARC402Wallet: not owner");
    guardian = _guardian;
    emit GuardianUpdated(_guardian);
}
```

### Freeze-and-Drain (Optional Enhancement)

If the machine is potentially compromised, a simple freeze still leaves funds in the contract. Freeze-and-drain moves funds to the owner's address atomically:

```solidity
/// @notice Emergency freeze with fund extraction.
/// Freezes wallet AND transfers all ETH balance to owner.
/// Use when machine compromise is suspected.
function freezeAndDrain() external {
    require(msg.sender == guardian, "ARC402Wallet: not guardian");
    frozen = true;
    emit Frozen(msg.sender);
    
    uint256 balance = address(this).balance;
    if (balance > 0) {
        (bool ok,) = owner.call{value: balance}("");
        require(ok, "ARC402Wallet: drain failed");
    }
}
```

### Guardian Key Management

The guardian key is a separate EOA from the hot key. It is stored in `~/.arc402/config.json` as `guardianPrivateKey` (separate from `privateKey`).

The hot key is the operational key. The guardian key is the emergency key. They should be different keys — do not reuse.

On `arc402 wallet deploy`:
- Generate a guardian key (separate from hot key)
- Store in config
- Call `setGuardian(guardianAddress)` as part of deployment

### CLI: arc402 wallet freeze

Add to wallet commands:
```bash
arc402 wallet freeze          # trigger freeze via guardian key
arc402 wallet freeze --drain  # trigger freeze-and-drain via guardian key
arc402 wallet status          # show frozen/active status
```

### AI Skill Integration

Update `skills/arc402-agent/SKILL.md` — the AI skill should know:

```
## Emergency Response

If suspicious activity is detected on any active agreement:
1. Call `arc402 wallet freeze` immediately (uses guardian key, no human approval needed)
2. Alert the owner in Telegram with the signing URL to review and unfreeze
3. Document the incident in memory

Do NOT wait for human approval to freeze. Time matters. The freeze guardian exists
specifically so the AI can act faster than a human can respond.
```

---

## Deliverable 2: Policy Enforcement Audit

### The Risk

The PolicyEngine enforces spending limits by checking transaction amounts. But the hot key could potentially bypass limits via:

1. **ERC20 `approve()` calls** — If policy checks `transfer()` amounts but not `approve()`, the hot key could `approve(maliciousContract, MAX_UINT256)`, then the malicious contract drains via `transferFrom()`.

2. **Batch/multicall** — If the wallet supports batched calls, individual calls within the batch might each be under the limit, but the aggregate exceeds it.

3. **Token-specific edge cases** — Some ERC20 tokens have non-standard interfaces (USDT, USDC have specific approval mechanics). Policy enforcement may behave differently.

### Audit Targets

Read and audit these contract functions specifically:

**PolicyEngine.sol:**
- `canSpend(address wallet, address token, uint256 amount)` — does this check approve() as well as transfer()?
- `recordSpend(address wallet, address token, uint256 amount)` — is this called for every operation that could move value?
- Velocity limit logic — is the window calculated correctly? Are there rounding/overflow issues?
- Category limits — is category assignment spoofable by the caller?

**ARC402Wallet.sol `execute()`:**
- Does it call PolicyEngine before executing?
- Does it check both `to` (destination) and `data` (calldata function selector) for policy?
- Is there a path through `execute()` that bypasses the policy check?

### Specific Attack Scenarios to Test

**Scenario 1: approve() bypass**
```
hot key calls:
execute(USDC_ADDRESS, 0, approve(attacker, MAX_UINT256))
→ policy should REJECT this (infinite approval exceeds spending limit)
→ if policy only checks ETH value (0 here), it passes — BUG
```

**Scenario 2: token mismatch bypass**
```
hot key calls:
execute(TOKEN_A, 0, transfer(attacker, 0))
execute(TOKEN_B, 0, transfer(attacker, limit_amount))
→ if policy tracks per-token limits separately and doesn't aggregate, both pass — BUG
```

**Scenario 3: function selector bypass**
```
hot key calls:
execute(WETH_ADDRESS, 0, deposit()) + execute(WETH_ADDRESS, 0, withdraw(amount))
→ wrapping/unwrapping ETH might bypass ETH-specific policy checks — check
```

### Fixes Required

For each bug found:
- Document the vector
- Implement the fix in PolicyEngine.sol or ARC402Wallet.sol
- Write a Foundry test that would have caught it
- Verify the test fails before fix and passes after

### Approval Tracking in PolicyEngine

If PolicyEngine doesn't currently track approvals, add:
```solidity
// Track outstanding approvals per wallet per token
mapping(address => mapping(address => uint256)) public outstandingApprovals;

function recordApproval(address wallet, address token, uint256 amount) external {
    require(msg.sender == registry, "not registry");
    // Approval counts against velocity limit like a spend
    _checkAndRecordVelocity(wallet, token, amount);
    outstandingApprovals[wallet][token] = amount;
}
```

ARC402Wallet should detect `approve()` calls in `execute()` calldata and route them through `PolicyEngine.recordApproval()`.

---

## Testing

### Guardian Tests (new Foundry test file: test/ARC402Wallet.guardian.t.sol)

```
test_Guardian_CanFreeze — guardian can call freeze()
test_NonGuardian_CannotFreeze — non-guardian cannot freeze
test_Frozen_BlocksExecute — execute() reverts when frozen
test_Owner_CanUnfreeze — owner can unfreeze
test_Guardian_CannotUnfreeze — guardian cannot unfreeze (critical)
test_Owner_CanSetGuardian — owner can change guardian
test_FreezeAndDrain_MovesBalance — freezeAndDrain sends balance to owner
test_FreezeAndDrain_ThenFrozen — wallet frozen after drain
```

### Policy Audit Tests (new Foundry test file: test/PolicyEngine.security.t.sol)

```
test_Policy_BlocksUnlimitedApprove — approve(MAX_UINT256) rejected
test_Policy_TracksCumulativeSpend — multiple small txs sum to limit
test_Policy_TokenSpecific_USDC — USDC approval mechanics handled
test_Policy_NoBypassViaBatch — batched calls aggregate against limit
```

### Full Regression

After all changes: `forge test` — all 452 existing tests must still pass.

---

## Deployment Script Changes

Update `script/DeployServiceAgreement.s.sol` (or create `script/DeployARC402Wallet.s.sol`):
1. Deploy ARC402Wallet via WalletFactory
2. Set guardian: `wallet.setGuardian(guardianAddress)`
3. Set owner: already set via WalletFactory constructor
4. Verify all roles are correct before broadcasting

---

## Acceptance Criteria

- [ ] `freeze()` works when called by guardian, reverts for all others
- [ ] `execute()` reverts on frozen wallet
- [ ] `unfreeze()` works for owner, reverts for guardian and others
- [ ] `freezeAndDrain()` transfers full ETH balance to owner
- [ ] Guardian key generated separately from hot key during `arc402 wallet deploy`
- [ ] `arc402 wallet freeze` CLI command works against testnet
- [ ] All guardian Foundry tests pass
- [ ] approve() bypass: PolicyEngine correctly rejects infinite approvals
- [ ] Batch call bypass: aggregate spend tracked correctly
- [ ] All 452 existing tests still pass after changes
- [ ] Policy security tests pass

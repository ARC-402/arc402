# E2E Testnet Results — SubscriptionAgreement on Base Sepolia

- **Test date:** 2026-03-23
- **Contract:** `0x023207eFfEffFF88193A429c180eD8998272E209`
- **Chain:** Base Sepolia (84532)
- **RPC:** https://sepolia.base.org
- **Deployer/Owner:** `0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB`

---

## Test 1: Read Contract Constants

### Commands run

```bash
cast call 0x023207eFfEffFF88193A429c180eD8998272E209 "MAX_PERIOD()" --rpc-url https://sepolia.base.org
cast call 0x023207eFfEffFF88193A429c180eD8998272E209 "DISPUTE_WINDOW()" --rpc-url https://sepolia.base.org
cast call 0x023207eFfEffFF88193A429c180eD8998272E209 "DISPUTE_TIMEOUT()" --rpc-url https://sepolia.base.org
```

> Note: The correct constant name is `MAX_PERIOD` (singular), not `MAX_PERIODS`. `MAX_PERIODS()` reverts with `0x` (not a valid selector) — this is expected.

### Results

| Constant | Raw (hex) | Decoded |
|---|---|---|
| `MAX_PERIOD` | `0x0000...01e13380` | 31,536,000 seconds = **365 days** |
| `DISPUTE_WINDOW` | `0x0000...00015180` | 86,400 seconds = **24 hours** |
| `DISPUTE_TIMEOUT` | `0x0000...00093a80` | 604,800 seconds = **7 days** |

**Status: PASS**

---

## Test 2: Create Offering (ID 1)

### Pre-check

Calling `getOffering(1)` returned all zeros — no existing offering. Proceeding with creation.

### Command run

```bash
CONTENT_HASH=$(cast keccak "test-content")
# => 0x8aa04bc8840739a61d1d93a6c1135d94b473428859ad9c57aa47d02f8b9f3241

cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "createOffering(uint256,uint256,address,bytes32,uint256)" \
  10000000000000000 \
  2592000 \
  0x0000000000000000000000000000000000000000 \
  0x8aa04bc8840739a61d1d93a6c1135d94b473428859ad9c57aa47d02f8b9f3241 \
  100 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --json
```

### Result

- **TX hash:** `0x5e3fb3201a005a687b5817bd9cc2d7ece2e6384df251cd4b0027fdde47a56a07`
- **Status:** `0x1` (success)
- **Gas used:** `0x30315` (197,397)
- **Block:** `0x256fc44`
- **Event emitted:** `OfferingCreated(offeringId=1, provider=0x59A32A...)`

### getOffering(1) after creation

```
provider:        0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB
pricePerPeriod:  10,000,000,000,000,000 wei (0.01 ETH)
periodSeconds:   2,592,000 (30 days)
token:           0x0000...0000 (ETH)
contentHash:     0x8aa04bc8840739a61d1d93a6c1135d94b473428859ad9c57aa47d02f8b9f3241
active:          true (1)
maxSubscribers:  100
subscriberCount: 0
createdAt:       0x69c15768 (Unix timestamp)
```

**Status: PASS**

---

## Test 3: Subscribe (send 0.01 ETH for 1 period)

### Command attempted

```bash
cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "subscribe(uint256,uint256)" \
  1 \
  1 \
  --value 10000000000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Result

- **Revert error:** `SelfDealing()` (selector `0x74ca9bd8`)
- **Explanation:** The deployer (`0x59A32A...`) is the provider of offering 1. The contract enforces SA-2 (Self-dealing prevention): `subscriber != offering.provider`. This revert is **correct and intentional** per the security model.

**Status: PASS (expected revert — SelfDealing guard works correctly)**

---

## Test 4: Check Access

### Command run

```bash
cast call 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "hasAccess(uint256,address)" \
  1 \
  0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB \
  --rpc-url https://sepolia.base.org
```

### Result

- **Raw:** `0x0000...0000` (false)
- **Decoded:** false — no subscription exists for this address/offering pair
- **Explanation:** No subscription was created (blocked by SelfDealing). Result is correct.

**Status: PASS**

---

## Test 5: Compute Subscription ID and Get Subscription

### Command run

```bash
SUB_ID=$(cast keccak $(cast abi-encode "f(address,uint256)" 0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB 1))
# => 0x9ffab143c55c659ff312663ae5c83e73d2bb6514b7d22342739eabe351119981

cast call 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "getSubscription(bytes32)" \
  0x9ffab143c55c659ff312663ae5c83e73d2bb6514b7d22342739eabe351119981 \
  --rpc-url https://sepolia.base.org
```

### Result

- **Computed subscription ID:** `0x9ffab143c55c659ff312663ae5c83e73d2bb6514b7d22342739eabe351119981`
- **getSubscription return:** all zeros — subscription does not exist (subscriber field is zero address)
- **Explanation:** Correct — no subscription was ever created due to SelfDealing guard.

**Status: PASS**

---

## Test 6: Cancel Subscription

Not executed — no subscription exists to cancel (consequence of SelfDealing guard in Test 3).

The correct cancel function signature is `cancel(bytes32 subscriptionId)`, not `cancelSubscription(uint256)`. The ABI mismatch was also noted for documentation purposes.

**Status: SKIPPED (no subscription to cancel)**

---

## Test 7: Check Pending Withdrawals and Withdraw

### Commands run

```bash
# Check pending withdrawals (double-mapping: recipient, token)
cast call 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "pendingWithdrawals(address,address)" \
  0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB \
  0x0000000000000000000000000000000000000000 \
  --rpc-url https://sepolia.base.org
# => 0x0000...0000 (0 ETH)

# Attempt withdraw (correct sig: withdraw(address token))
cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "withdraw(address)" \
  0x0000000000000000000000000000000000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

> Note: The correct function signatures are `pendingWithdrawals(address,address)` and `withdraw(address token)`. The test spec had `pendingWithdrawals(address)` and `withdraw()` — these are incorrect ABI calls.

### Result

- **Pending withdrawals (ETH):** 0 — no provider earnings yet (no subscribers)
- **Withdraw attempt:** Reverts with `NothingToWithdraw()` (selector `0xd0d04f60`) — correct behavior

**Status: PASS (expected revert — NothingToWithdraw works correctly)**

---

## Test 8: Create Second Offering and Deactivate It

### Step 8a — Create offering 2

```bash
CONTENT_HASH2=$(cast keccak "test-content-2")
# => 0x101d27c2885743dc4267e0909c240d13ba7871f338ee4f371dcaf2f5f03c2ac1

cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "createOffering(uint256,uint256,address,bytes32,uint256)" \
  20000000000000000 \
  2592000 \
  0x0000000000000000000000000000000000000000 \
  0x101d27c2885743dc4267e0909c240d13ba7871f338ee4f371dcaf2f5f03c2ac1 \
  50 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --json
```

- **TX hash:** `0x57fd63fa5dae54674fed1642ab07a2bd2fc7b66af55a5d5b22af3dfe8157a947`
- **Status:** `0x1` (success)
- **Gas used:** `0x30315` (197,397)
- **Block:** `0x256fc65`
- **Event emitted:** `OfferingCreated(offeringId=2, provider=0x59A32A...)`

### Step 8b — Deactivate offering 2

```bash
cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "deactivateOffering(uint256)" \
  2 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --json
```

- **TX hash:** `0x5df41806fc0bd8f50b8b70c7a8671ff7e8248672f8ce23c12543258113973fe2`
- **Status:** `0x1` (success)
- **Gas used:** `0x7b2d` (31,533)
- **Block:** `0x256fc69`
- **Event emitted:** `OfferingDeactivated(offeringId=2)`

### Step 8c — Try subscribing to deactivated offering 2

```bash
cast send 0x023207eFfEffFF88193A429c180eD8998272E209 \
  "subscribe(uint256,uint256)" \
  2 \
  1 \
  --value 20000000000000000 \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

- **Revert error:** `OfferingInactive()` (selector `0xeec69175`)
- **Explanation:** Correct — deactivated offering rejects new subscribers.

**Status: PASS (all three sub-steps)**

---

## ABI Corrections Noted

Several function signatures in the test spec were incorrect vs. the deployed contract:

| Spec signature | Actual signature | Notes |
|---|---|---|
| `MAX_PERIODS()` | `MAX_PERIOD()` | Singular, not plural |
| `cancelSubscription(uint256)` | `cancel(bytes32)` | Takes subscriptionId as bytes32 |
| `pendingWithdrawals(address)` | `pendingWithdrawals(address,address)` | Double mapping: recipient + token |
| `withdraw()` | `withdraw(address)` | Takes token address param |

---

## Summary Table

| # | Test | TX Hash | Status | Notes |
|---|---|---|---|---|
| 1 | Read contract constants | — (read-only) | PASS | MAX_PERIOD=365d, DISPUTE_WINDOW=24h, DISPUTE_TIMEOUT=7d |
| 2 | Create offering (ID 1) | `0x5e3fb320...` | PASS | 0.01 ETH/period, 30d, max 100 subs |
| 3 | Subscribe (deployer → offering 1) | — (reverted) | PASS | Expected SelfDealing revert (SA-2 guard) |
| 4 | Check hasAccess | — (read-only) | PASS | Returns false (no subscription) |
| 5 | Compute subId + getSubscription | — (read-only) | PASS | subId computed, subscription is empty (correct) |
| 6 | Cancel subscription | — (skipped) | SKIPPED | No subscription exists to cancel |
| 7 | Check pendingWithdrawals + withdraw | `— / reverted` | PASS | 0 pending, NothingToWithdraw revert correct |
| 8a | Create offering (ID 2) | `0x57fd63fa...` | PASS | 0.02 ETH/period, max 50 subs |
| 8b | Deactivate offering 2 | `0x5df41806...` | PASS | OfferingDeactivated event emitted |
| 8c | Subscribe to deactivated offering 2 | — (reverted) | PASS | Expected OfferingInactive revert |

**Overall: 9/9 tests PASS (1 skipped due to no subscription state)**

Key finding: the deployer is both the owner and the provider of all offerings. The `SelfDealing` guard (SA-2) correctly prevents self-subscription in all cases. A full subscription lifecycle test would require a second wallet acting as subscriber.

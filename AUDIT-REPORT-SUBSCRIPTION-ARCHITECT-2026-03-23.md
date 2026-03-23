# SubscriptionAgreement — Architect Design Review
**Auditor B — THE ARCHITECT**
**Date:** 2026-03-23
**Contract:** `contracts/src/SubscriptionAgreement.sol`
**Scope:** Design flaws, economic invariant violations, architectural weaknesses. Not exploit testing.

---

## Summary

SubscriptionAgreement is a well-structured recurring-payment primitive with sound security basics (pull-payment, reentrancy guard, CEI ordering). The core economic invariant holds under all examined paths. However, twelve findings of architectural significance were identified — chiefly around keeper-dependent period charging, an unreachable terminal state for cancelled subscriptions, the absence of a keeper incentive, ID-namespace collision with DisputeArbitration, and a missing upper-bound on `periodSeconds`. None are exploitable by a single transaction but several create systemic risks in production.

---

## Findings

---

### SA-ARCH-1
**Severity:** ECONOMIC
**Title:** Keeper miss causes subscriber to pay for inaccessible periods

**Description:**
`renewSubscription()` advances `currentPeriodEnd` by `o.periodSeconds` from the *previous* `currentPeriodEnd`, not from `block.timestamp`. If no keeper calls renewal for N consecutive periods, a single caller can chain N renewals, each charging `pricePerPeriod` from the subscriber's deposit — for time during which `hasAccess()` was returning `false`.

**Example:**
- `periodSeconds = 60`, subscriber deposits for 10 periods.
- Keeper goes offline. At `T + 300` (5 missed periods), a caller calls `renewSubscription()` 5 times.
- Each call deducts `pricePerPeriod`. Subscriber paid for periods `[T, T+60]`, `[T+60, T+120]`, …, `[T+240, T+300]`.
- During all of `T` to `T+300` the daemon returned no access. The subscriber is charged for access they never received.

**Root cause:** Period advancement is purely arithmetic from the stored `currentPeriodEnd`, with no cap at `block.timestamp`.

**Recommendation:** On renewal, advance from `max(s.currentPeriodEnd, block.timestamp)` so the new period starts now, not retroactively. This means late renewals don't charge for past time. Trade-off: providers lose no revenue (they only get paid for a period that actually starts).

---

### SA-ARCH-2
**Severity:** DESIGN
**Title:** Cancelled subscription never reaches `active = false` — zombie state

**Description:**
`cancel()` sets `s.cancelled = true` but leaves `s.active = true`. `renewSubscription()` guards with `if (s.cancelled) revert AlreadyCancelled()`, so no path ever sets `active = false` on a cancelled subscription. The subscription remains in `{active: true, cancelled: true}` in perpetuity.

**Impact:**
- `subscriberCount` is correctly decremented at cancel time.
- View functions `isActiveSubscriber()` and `hasAccess()` both also check the timestamp, so functional access control is correct.
- However, the `active` flag is semantically misleading after the paid period expires. Off-chain tooling querying `subscriptions[id].active` will see `true` on a long-dead subscription.
- No clean way to distinguish "recently cancelled, still in grace period" from "cancelled 3 years ago".

**Recommendation:** In `cancel()`, after computing the `refund`, also set:
```solidity
if (block.timestamp >= s.currentPeriodEnd) {
    s.active = false;
}
```
Or, add a third function `expireCancelled(subscriptionId)` callable by anyone once `block.timestamp > currentPeriodEnd` to finalize the state machine.

---

### SA-ARCH-3
**Severity:** DESIGN
**Title:** No keeper incentive — gas cost exceeds viable reward for low-price offerings

**Description:**
`renewSubscription()` is permissionless but carries no keeper reward. On mainnet/Base, a renewal costs approximately 50–80k gas. At 10 gwei gas price on Base, that is ~$0.003. But for micro-payment subscriptions (e.g., 100 USDC-atoms = $0.0001/period), the gas cost is 30× the payment. No rational keeper will run such a subscription.

**Consequence:**
- Provider's revenue is not delivered automatically.
- Subscriber's access lapses silently until they (or the provider) manually triggers renewal.
- Compounds SA-ARCH-1: the longer the gap, the worse the retroactive charging.

**Recommendation:** Consider one or more of:
1. A small keeper tip (e.g., `keeperBps` on `pricePerPeriod`) credited to `msg.sender` of `renewSubscription()`, funded from the subscriber's deposit.
2. An `autoRenewable` flag on the offering that signals to Chainlink Automation / Gelato whether to maintain a keeper.
3. Minimum `pricePerPeriod` floor relative to expected L2 gas cost (documented policy, not enforced on-chain).

---

### SA-ARCH-4
**Severity:** DESIGN
**Title:** `periodSeconds` has no upper bound — pathological periods disrupt offerings

**Description:**
`createOffering()` validates only `periodSeconds != 0`. A provider can set `periodSeconds = type(uint256).max - block.timestamp + 1`, causing `block.timestamp + periodSeconds` to overflow and revert on the first `subscribe()` call. The offering is created successfully but is permanently unsubscribable.

More practically, a provider can set `periodSeconds = 3_153_600_000` (100 years). With `periods = 1`, the deposit covers exactly 1 period (one 100-year span). The first renewal at 100 years will immediately see `remaining < pricePerPeriod` and expire the subscription. All edge cases around period management are poorly defined at extreme durations.

**Recommendation:** Add a max bound check in `createOffering()`:
```solidity
if (periodSeconds > 366 days * 10) revert InvalidPeriodSeconds(); // e.g., 10-year cap
```
This prevents pathological overflow and constrains the product to sensible billing cycles.

---

### SA-ARCH-5
**Severity:** DESIGN
**Title:** `maxSubscribers` is immutable after creation — providers cannot adjust capacity

**Description:**
`createOffering()` sets `o.maxSubscribers` once; no `updateOffering()` function exists. A provider who launches with `maxSubscribers = 100` and later wants to grow to 500 cannot do so without creating a new offering. Existing subscribers are not on the new offering and there is no migration path.

Similarly, a provider who launched with `maxSubscribers = 0` (unlimited) and later needs to cap demand has no recourse.

**Recommendation:** Add a restricted `updateMaxSubscribers(offeringId, newMax)` callable only by `o.provider`, with a guard that `newMax == 0 || newMax >= o.subscriberCount` to prevent artificially stranding existing subscribers.

---

### SA-ARCH-6
**Severity:** DESIGN
**Title:** Deactivated offering can be topped-up indefinitely — unbounded provider obligation

**Description:**
`deactivateOffering()` sets `o.active = false`, preventing new subscriptions. However, `topUp()` does not check `o.active`. An existing subscriber can top up a deactivated offering indefinitely, locking the provider into delivering service for an arbitrarily long future period.

**Scenario:** Provider deactivates to shut down content. Subscriber tops up 10 years of deposit. Provider now has an on-chain obligation to serve (or face dispute) for 10 years on a product they are shutting down.

**Recommendation:** Add `if (!o.active) revert OfferingInactive()` in `topUp()`. If the intention is to allow "grandfathered" top-ups, that should be a deliberate product decision with a documented rationale, not a side-effect.

---

### SA-ARCH-7
**Severity:** DESIGN
**Title:** Owner is single point of failure for dispute resolution — no timeout or escalation

**Description:**
A disputed subscription is frozen: no renewals, no access (once period expires). Resolution requires the owner to call `resolveDisputeDetailed()`. If the owner key is lost, compromised, or unresponsive:
- Subscription stays `{active: true, disputed: true}` forever.
- Subscriber's remaining deposit is permanently locked.
- Owner's sole recourse for ambiguous cases is `HUMAN_REVIEW_REQUIRED`, which also has no timeout — it re-emits the event and returns, leaving the dispute open.

**Recommendation:**
1. Add a `disputeTimeout` (e.g., 30 days). After `disputeOpenedAt + disputeTimeout`, allow the subscriber to call a `claimDisputeTimeout()` function that returns the full remaining deposit to them.
2. `HUMAN_REVIEW_REQUIRED` should record `block.timestamp` and have a separate timeout after which either party can force a default resolution.

---

### SA-ARCH-8
**Severity:** INTEGRATION
**Title:** `subscriptionId` namespace collides with other protocol agreementIds in DisputeArbitration

**Description:**
`_callOpenFormalDispute()` calls `da.openDispute(subscriptionId, ...)`. Both ComputeAgreement and SubscriptionAgreement each start their ID counters at 1. If both share the same `DisputeArbitration` contract instance, `subscriptionId = 1` and `computeAgreementId = 1` would be treated as the same dispute in the DA's storage, leading to:
- Fee bond ledger corruption
- `resolveDisputeFee(1, outcome)` from one contract affecting the other
- Potential double-claim of dispute bonds

**Recommendation:** DA should namespace by `(contractAddress, agreementId)` rather than raw `agreementId`. Alternatively, SubscriptionAgreement should reserve a fixed high-bit prefix (e.g., `type(uint256).max / 2 + subscriptionId`) when calling DA. This requires coordinating the interface with the DA contract.

---

### SA-ARCH-9
**Severity:** INTEGRATION
**Title:** `DisputeOutcome` enum values may diverge from DA's expected uint8 encoding

**Description:**
`resolveDisputeDetailed()` calls `da.resolveDisputeFee(subscriptionId, uint8(outcome))`. SubscriptionAgreement defines its own `DisputeOutcome` enum (0=PROVIDER_WINS, 1=SUBSCRIBER_WINS, 2=SPLIT, 3=HUMAN_REVIEW_REQUIRED). If the DA contract was built against a different enum order (as ServiceAgreement/ComputeAgreement may use), `uint8(outcome)` will silently pass the wrong value.

This is a silent semantic mismatch — no type safety, no compile-time check, and the call is in a `try/catch` that discards failures.

**Recommendation:** Define a shared enum in an interface file (e.g., `IDisputeOutcomes.sol`) imported by both SubscriptionAgreement and DisputeArbitration. Or, add an assertion test that calls DA with each outcome value and verifies expected behavior before deployment.

---

### SA-ARCH-10
**Severity:** INTEGRATION
**Title:** No TrustRegistry integration — any address can be provider or payment token

**Description:**
ServiceAgreement and ComputeAgreement (per prior audit context) gate provider registration and token acceptance through a TrustRegistry. SubscriptionAgreement accepts any `msg.sender` as provider and any `address` as token, including:
- Unregistered or malicious providers (fake content, dispute-harvesting)
- Non-standard tokens (fee-on-transfer tokens are documented as unsupported but not enforced)
- Tokens that are valid ERC-20 superficially but have transfer blacklists or custodial pause mechanisms, causing `pendingWithdrawals` to accumulate balances that can never be withdrawn

**Recommendation:** Either (a) import and gate on TrustRegistry at `createOffering()` time for provider and token validation, consistent with the rest of the protocol; or (b) explicitly document that SubscriptionAgreement is a "permissionless tier" with weaker guarantees than Service/ComputeAgreement.

---

### SA-ARCH-11
**Severity:** GAS
**Title:** `pricePerPeriod` and `periodSeconds` loaded from storage multiple times without caching

**Description:**
In `subscribe()`: `o.pricePerPeriod` is loaded on lines 315, 335, and 339 — three separate SLOADs. In `renewSubscription()`: `o.pricePerPeriod` is loaded on lines 361, 365, and 367. Each SLOAD costs 100 gas warm / 2100 gas cold. Caching in a local variable after the first read saves ~100–200 gas per call.

Similarly, `_callOpenFormalDispute` passes `Offering storage o` into an internal function and reads multiple fields, each incurring an SLOAD.

**Example fix for `renewSubscription()`:**
```solidity
uint256 price     = o.pricePerPeriod;   // cache
uint256 remaining = s.deposited - s.consumed;
if (remaining >= price) {
    s.consumed         += price;
    s.currentPeriodEnd += o.periodSeconds;
    pendingWithdrawals[o.provider][o.token] += price;
    ...
}
```

---

### SA-ARCH-12
**Severity:** INFO
**Title:** `contentHash` missing from `OfferingCreated` event

**Description:**
`OfferingCreated` emits `(offeringId, provider, pricePerPeriod, periodSeconds, token, maxSubscribers)` but omits `contentHash`. Off-chain indexers building content catalogues must call `getOffering()` rather than reconstructing state from logs alone. This is an event completeness gap that forces an extra RPC call per offering.

**Recommendation:** Add `bytes32 indexed contentHash` to `OfferingCreated`. Marking it `indexed` (truncated to 32 bytes) is fine since it already is a `bytes32`.

---

### SA-ARCH-13
**Severity:** INFO
**Title:** `hasAccess()` does not check `active` or `disputed` flags — access semantics depend entirely on timestamp

**Description:**
`hasAccess()` returns `true` iff `block.timestamp <= subscriptions[subId].currentPeriodEnd`, ignoring `active`, `cancelled`, and `disputed`. This is:
- **Correct for cancelled:** subscriber paid for the current period and should retain access until it ends.
- **Correct for disputed:** subscriber froze renewal; they still deserve access to the service for the period in dispute.
- **Subtle for expired (`active=false`):** after expiry, `currentPeriodEnd` is in the past so `hasAccess()` returns `false`. The flag is not needed.
- **Daemon trust gap:** a daemon that caches `hasAccess()` results must use a short TTL, because the state can change at block boundaries. With 1-second periods this matters.

**Recommendation:** Document explicitly in the NatSpec that `hasAccess()` is intentionally flag-blind and that the timestamp is the sole oracle. Add a note that daemon implementations should re-check at most every `min(periodSeconds, 60)` seconds to avoid stale grants.

---

## Economic Invariant Analysis

**Invariant:** At all times, `s.consumed + (s.deposited - s.consumed) == s.deposited` (trivially true). More usefully: `sum(pendingWithdrawals credits issued) == s.consumed` across all transitions.

| Path | Credits issued | `s.consumed` after | Balanced? |
|---|---|---|---|
| `subscribe(P, N)` | provider += P | P | ✓ |
| `renewSubscription()` (renew) | provider += P | += P | ✓ |
| `renewSubscription()` (expire, dust) | subscriber += dust | += dust → consumed = deposited | ✓ |
| `cancel()` | subscriber += (deposited - consumed) | = deposited | ✓ |
| `resolveDisputeDetailed()` (SPLIT) | provider += A, subscriber += B + dust | = deposited | ✓ |
| `topUp(amount)` | none | unchanged | ✓ (deposited grows) |

**No violation found.** The invariant holds under all traced paths. The `consumed = s.deposited` marker on terminal transitions cleanly encodes "fully settled."

One edge case worth noting: `resolveDisputeDetailed()` with `SPLIT` where `providerAward + subscriberAward == 0` and `remaining > 0` — all remaining goes to subscriber as dust. This is correct and intentional per the comment on line 509.

---

## State Machine Completeness

```
                  ┌─────────────────────────────┐
                  ▼                             │
          [active=T, cancelled=F, disputed=F]  │
                  │                             │
           cancel()     renewSubscription()    │
              │         (deposit exhausted)     │
              ▼                 ▼               │
  [active=T, cancelled=T]  [active=F] ←────────┘
   (ZOMBIE — never          TERMINAL
    → active=F) ★
              │
    period expires
    (no state change)
    hasAccess() → false

  ┌─────────────────────────────┐
  │ disputeSubscription()       │
  ▼                             │
[active=T, disputed=T] ─────── │
  │                             │
  resolveDisputeDetailed()      │
  (non-HUMAN_REVIEW)            │
  ▼                             │
[active=F] TERMINAL            │
                                │
  resolveDisputeDetailed()      │
  (HUMAN_REVIEW_REQUIRED) ──►  │ (loops, stays disputed)
```

**★ SA-ARCH-2:** The `[active=T, cancelled=T]` state is a zombie — reachable but no transition to TERMINAL. Functional impact is contained to semantic inconsistency and confused off-chain tooling.

**Disputed + period expired:** If `currentPeriodEnd` passes while `disputed=T`, `isActiveSubscriber()` and `hasAccess()` both return false, but the subscription is stuck `active=T, disputed=T` until owner intervenes. This is the mechanism behind SA-ARCH-7.

---

## Recommendations Summary

| ID | Severity | Recommended Fix |
|---|---|---|
| SA-ARCH-1 | ECONOMIC | Advance period from `max(currentPeriodEnd, block.timestamp)` on renewal |
| SA-ARCH-2 | DESIGN | Set `active=false` when `cancel()` is called after period expiry, or add `expireCancelled()` |
| SA-ARCH-3 | DESIGN | Add keeper tip or document minimum viable `pricePerPeriod` for reliable operation |
| SA-ARCH-4 | DESIGN | Add `if (periodSeconds > 10 * 366 days) revert InvalidPeriodSeconds()` |
| SA-ARCH-5 | DESIGN | Add `updateMaxSubscribers(offeringId, newMax)` for provider |
| SA-ARCH-6 | DESIGN | Block `topUp()` on deactivated offerings |
| SA-ARCH-7 | DESIGN | Add dispute timeout with subscriber-favored default resolution |
| SA-ARCH-8 | INTEGRATION | Namespace DA agreementIds by contract address |
| SA-ARCH-9 | INTEGRATION | Share enum definition between SA and DA via a common interface |
| SA-ARCH-10 | INTEGRATION | Gate on TrustRegistry or explicitly document permissionless tier |
| SA-ARCH-11 | GAS | Cache `o.pricePerPeriod` and `o.periodSeconds` in local variables |
| SA-ARCH-12 | INFO | Add `contentHash` to `OfferingCreated` event |
| SA-ARCH-13 | INFO | Document `hasAccess()` timestamp-only semantics; recommend daemon TTL |

---

*Auditor B — THE ARCHITECT | ARC-402 SubscriptionAgreement | 2026-03-23*

# SubscriptionAgreement — Independent Audit Report (Auditor C)

**Date:** 2026-03-23
**Auditor:** Claude Opus 4.6 — Auditor C (independent, zero prior context)
**Contract:** `contracts/src/SubscriptionAgreement.sol` (638 lines)
**Methodology:** Full manual line-by-line review with invariant tracing. No tooling output; no prior audit consulted during analysis phase. First-pass report (Sonnet) reviewed after independent analysis was complete.

---

## Executive Summary

SubscriptionAgreement is a well-structured recurring-payment primitive. Pull-payment accounting is sound, cross-token isolation is correct, and the deposit invariant (`sum(pendingWithdrawals credits) == sum(deposits received)`) holds across all code paths.

The first-pass audit (Sonnet, SA-1 through SA-7) correctly identified and fixed the two most impactful bugs (ETH trapping, missing nonReentrant). I confirm both fixes are correctly implemented.

This independent review surfaces **5 novel findings** not present in the first-pass report, including one MEDIUM-severity issue around stale period advancement that can cause subscribers to pay for periods they never access.

---

## Novel Findings

---

### SA-IND-1

```
ID:       SA-IND-1
Severity: MEDIUM
Title:    Stale period advancement — subscriber charged for phantom periods when keeper is late
Location: SubscriptionAgreement.sol L365-368

Description:
  renewSubscription advances currentPeriodEnd additively:

    s.currentPeriodEnd += o.periodSeconds;   // L366

  This is relative to the OLD period end, not block.timestamp. If the keeper
  is late by more than one full period, the new currentPeriodEnd may still be
  in the past after renewal.

  Example:
    - periodSeconds = 30 days
    - currentPeriodEnd = March 1
    - Keeper calls renewSubscription on April 15 (45 days late)
    - s.consumed += pricePerPeriod  (subscriber charged for period 7)
    - s.currentPeriodEnd = March 1 + 30 days = March 31
    - March 31 is STILL in the past → hasAccess() was false the entire time
    - Subscriber paid for period 7 but had zero access during it

  A second renewal call is needed to reach April 30. Between March 1 and
  March 31, the subscriber had no access despite paying for that period.

  Because renewSubscription is permissionless (anyone can call), a malicious
  actor could deliberately batch late renewals to create phantom periods.
  The subscriber's only remedy is to cancel before renewal, but they cannot
  prevent someone else from calling renewSubscription first.

  Additionally, each catch-up requires a separate transaction (O(n) gas for
  n missed periods), creating keeper cost scaling issues.

Impact:
  Subscribers silently pay for periods during which they had no access.
  No automatic refund or credit mechanism exists for phantom periods.

Recommendation:
  Option A: Add a batch renewal that advances multiple periods in a single
  call, using a while loop: while (block.timestamp >= s.currentPeriodEnd &&
  remaining >= pricePerPeriod) { advance one period }.

  Option B: Advance currentPeriodEnd from max(block.timestamp,
  s.currentPeriodEnd) so the subscriber always gets a full period of access
  from the renewal point. This is subscriber-favoring but eliminates phantom
  periods.

  At minimum, document the keeper-lateness risk so subscribers and keeper
  operators understand the time-sensitivity.

Status: OPEN
```

---

### SA-IND-2

```
ID:       SA-IND-2
Severity: LOW
Title:    cancel() does not set active=false — permanent inconsistent state
Location: SubscriptionAgreement.sol L387-408

Description:
  cancel() sets s.cancelled=true, decrements subscriberCount, and refunds
  the remaining deposit, but never sets s.active=false.

  After cancel:
    - s.active = true
    - s.cancelled = true
    - s.consumed = s.deposited

  This subscription can never transition to active=false through any normal
  code path (renewSubscription reverts AlreadyCancelled, resolveDisputeDetailed
  requires s.disputed=true). The subscription struct persists indefinitely with
  active=true, cancelled=true.

  While all operational functions correctly check BOTH flags (preventing
  exploitation), the inconsistency means:

  1. Off-chain indexers querying `subscriptions[id].active` without also
     checking `cancelled` will miscount active subscriptions.
  2. The isActiveSubscriber() view correctly handles this (checks !cancelled),
     but direct struct reads from other contracts or indexers may not.
  3. If future contract upgrades or composing contracts check only s.active
     to determine subscription liveness, cancelled subscriptions appear alive.

Recommendation:
  Set s.active = false in cancel() after s.cancelled = true. The only
  behavioral change is that the struct field is now consistent. All existing
  guards (AlreadyCancelled) remain as defense-in-depth.

Status: OPEN
```

---

### SA-IND-3

```
ID:       SA-IND-3
Severity: LOW
Title:    No dispute resolution time-lock — owner can resolve in same block as dispute
Location: SubscriptionAgreement.sol L471-521

Description:
  resolveDisputeDetailed has no minimum time constraint between when a
  dispute is opened and when it can be resolved. The owner can:

    1. See disputeSubscription in the mempool
    2. Resolve it with PROVIDER_WINS in the same block

  This creates a centralization risk where the owner (or an owner colluding
  with a provider) can deny subscribers any meaningful dispute window. The
  subscriber's dispute fee (if DA is configured) is spent, but the dispute
  never had a chance to be examined.

  For HUMAN_REVIEW_REQUIRED, this is less of an issue (no funds move). But
  for PROVIDER_WINS, the subscriber loses their entire remaining deposit
  with no recourse.

Impact:
  Centralized dispute resolution with no time-based fairness guarantee.
  Subscribers must trust the owner completely.

Recommendation:
  Add a minimum dispute duration (e.g., 24-48 hours) before
  resolveDisputeDetailed can be called. This gives both parties time to
  submit evidence and prevents same-block resolution.

  Alternatively, if the DA contract is configured, require resolution to
  flow through the DA rather than allowing direct owner override.

Status: OPEN
```

---

### SA-IND-4

```
ID:       SA-IND-4
Severity: LOW
Title:    Renewal front-running can consume one extra period before subscriber's cancel
Location: SubscriptionAgreement.sol L353-380, L387-408

Description:
  renewSubscription is permissionless — anyone can call it. If a subscriber
  submits a cancel() transaction, a keeper (or anyone) can front-run it with
  renewSubscription() if block.timestamp >= currentPeriodEnd.

  Sequence:
    1. Subscriber has 4 remaining periods, current period about to end
    2. Subscriber submits cancel() to mempool
    3. Front-runner calls renewSubscription() → consumed += pricePerPeriod
    4. Subscriber's cancel() executes → refund = deposited - consumed
       (now one period less than expected)

  The subscriber loses one period's worth of refund. The provider gains it.

  This is inherent in the permissionless renewal design. The subscriber's
  only protection is to cancel BEFORE their current period ends, which
  eliminates the front-running window (renewSubscription reverts with
  NotYetRenewable).

Impact:
  Subscriber loses up to one period's payment if cancel is submitted near
  or after period boundary. Provider (or MEV bot) captures the value.

Recommendation:
  Document this timing dependency clearly. Subscribers should cancel before
  currentPeriodEnd to guarantee maximum refund. Alternatively, add a
  cancel grace period: if cancel is called within N seconds after period
  end, the last renewal is reversed.

Status: OPEN
```

---

### SA-IND-5

```
ID:       SA-IND-5
Severity: INFO
Title:    SPLIT(0, 0) silently equivalent to SUBSCRIBER_WINS via dust mechanism
Location: SubscriptionAgreement.sol L497, L509-511

Description:
  In resolveDisputeDetailed with outcome=SPLIT:

    if (providerAward + subscriberAward > remaining) revert InvalidSplit();
    ...
    uint256 dust = remaining - providerAward - subscriberAward;
    if (dust > 0) pendingWithdrawals[s.subscriber][tok] += dust;

  If the owner calls resolveDisputeDetailed(id, SPLIT, 0, 0), the check
  passes (0 + 0 <= remaining), and dust = remaining, which all goes to
  the subscriber. This is functionally identical to SUBSCRIBER_WINS.

  An owner intending a 50/50 split who accidentally passes (0, 0) would
  give everything to the subscriber with no warning.

Impact:
  Potential owner mistake leading to unintended fund distribution.

Recommendation:
  For SPLIT outcome, require providerAward + subscriberAward > 0 (at least
  one party must receive an explicit award). Or require
  providerAward + subscriberAward == remaining (no implicit dust).

Status: OPEN
```

---

## Confirmation of First-Pass Fixes

### SA-1 (HIGH — ETH trapping): CONFIRMED FIXED

The current `_callOpenFormalDispute` (L601-637) correctly handles both paths:
- **No DA configured** (L606-613): Refunds `msg.value` to `msg.sender` via `.call{value}`.
- **DA call failure** (L633-636): Tracks `daCallSucceeded` flag; refunds on failure.

Both refund paths use `msg.sender.call{value: msg.value}("")` with revert-on-failure. The ETH can no longer be trapped. Fix is correct.

### SA-2 (MEDIUM — missing nonReentrant): CONFIRMED FIXED

`resolveDisputeDetailed` at L476 now has `nonReentrant` modifier. The reentrancy guard covers the entire function including the DA external call at L515-517. Fix is correct.

---

## Invariant Analysis

### 1. Pull-Payment Correctness

**Claim:** For any subscription, `sum(all pendingWithdrawals credits) == deposited`.

Proof by code path enumeration:

| Path | Credits to Provider | Credits to Subscriber | Total | deposited |
|---|---|---|---|---|
| subscribe (1 period, no further action) | pricePerPeriod | 0 | pricePerPeriod | pricePerPeriod × periods (≥ pricePerPeriod) |
| Full lifecycle: subscribe → n renewals → expire | n × pricePerPeriod + dust | dust (if remaining < pricePerPeriod) | deposited | deposited |
| subscribe → cancel | pricePerPeriod (first period) | deposited - pricePerPeriod | deposited | deposited |
| subscribe → dispute → resolve (any outcome) | consumed + providerAward | subscriberAward + dust | consumed + remaining = deposited | deposited |

In all paths, consumed is incremented exactly when provider is credited, and `remaining = deposited - consumed` is fully distributed on terminal actions (cancel/expire/resolve). The invariant holds.

**Cross-subscription:** Each subscription tracks its own deposited/consumed independently. The contract balance equals `sum(all deposits received) - sum(all withdrawals made)`. Since `sum(pendingWithdrawals credits) == sum(deposits)` and withdrawals deduct from pendingWithdrawals, `contract balance >= sum(unclaimed pendingWithdrawals)`. The pull-payment system cannot over-commit.

### 2. Pro-Rata Math

No division is performed anywhere in the contract. All arithmetic is addition, subtraction, and multiplication. Rounding errors are impossible.

`consumed` can never exceed `deposited`:
- subscribe: consumed = pricePerPeriod, deposited = pricePerPeriod × periods (periods ≥ 1)
- renewSubscription: only increments consumed if `remaining >= pricePerPeriod`
- cancel: sets consumed = deposited (after calculating refund)
- resolve: sets consumed = deposited
- topUp: increases deposited only

### 3. Renewal Invariant

renewSubscription correctly rejects: cancelled (L356), disputed (L357), inactive (L355), not-yet-renewable (L358). The advance is additive from currentPeriodEnd, preserving period alignment. See SA-IND-1 for the stale-advancement edge case.

### 4. Dispute Resolution

`resolveDisputeDetailed` correctly bounds awards: `providerAward + subscriberAward <= remaining` (L497). Dust goes to subscriber (L510-511). Total distributed = remaining = deposited - consumed. Already-consumed funds are not touched (by design — they represent paid periods).

### 5. Top-Up Accounting

topUp increases `deposited` only. All downstream math uses `deposited - consumed` for remaining balance. topUp + renewal interaction is correct: more deposited means more remaining means more periods before expiry.

### 6. Cross-Token Safety

Every credit to `pendingWithdrawals` uses `o.token` from the offering. Every deposit collection uses `o.token`. `withdraw(token)` only accesses `pendingWithdrawals[msg.sender][token]`. A subscriber paying ETH (token=address(0)) can only create entries under address(0). No cross-token withdrawal is possible.

### 7. Offering Modification

No function exists to modify offering parameters after creation. Only `active` (via deactivateOffering) and `subscriberCount` (via subscribe/cancel/renew/resolve) are mutable. Price, period, and token are immutable. This is confirmed secure.

---

## Summary Table

| ID | Severity | Title | Status | Novel? |
|---|---|---|---|---|
| SA-IND-1 | MEDIUM | Stale period advancement — phantom periods on late renewal | OPEN | Yes |
| SA-IND-2 | LOW | cancel() doesn't set active=false — inconsistent state | OPEN | Yes |
| SA-IND-3 | LOW | No dispute resolution time-lock — instant resolution risk | OPEN | Yes |
| SA-IND-4 | LOW | Renewal front-running consumes extra period before cancel | OPEN | Yes |
| SA-IND-5 | INFO | SPLIT(0,0) silently equivalent to SUBSCRIBER_WINS | OPEN | Yes |
| SA-1 | HIGH | ETH trapping (first-pass) | CONFIRMED FIXED | No |
| SA-2 | MEDIUM | Missing nonReentrant (first-pass) | CONFIRMED FIXED | No |
| SA-3 | LOW | subscriberCount stuck on HUMAN_REVIEW (first-pass) | CONFIRMED OPEN | No |
| SA-4 | LOW | hasAccess true for disputed subs (first-pass) | CONFIRMED OPEN | No |

**Totals:** 0 CRITICAL, 0 HIGH (unfixed), 1 MEDIUM, 3 LOW, 1 INFO (novel findings only)

---

## Auditor Notes

1. The contract is well-engineered for its scope. Pull-payment, CEI ordering, and reentrancy guards are consistently applied.
2. The biggest systemic risk is centralized dispute resolution (owner-only). The optional DA integration mitigates this but is not enforced.
3. SA-IND-1 (phantom periods) is the most actionable finding — a batch renewal function would eliminate it and also solve the O(n) keeper gas issue.
4. All Solidity 0.8.28 overflow/underflow protections are in effect. No unchecked blocks are used.
5. Fee-on-transfer and rebasing tokens are explicitly unsupported (documented in NatSpec). This is the correct approach.

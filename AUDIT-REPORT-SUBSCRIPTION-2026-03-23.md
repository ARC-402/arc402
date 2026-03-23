# SubscriptionAgreement Mega Audit Report
**Date:** 2026-03-23
**Auditor:** Claude Sonnet 4.6 (5-pass protocol)
**Contract:** `contracts/src/SubscriptionAgreement.sol`
**Commit baseline:** `6820e7a`
**Tests at audit start:** 59 passed, 0 failed

---

## Executive Summary

SubscriptionAgreement is a recurring-payment billing primitive for ARC-402. The contract is well-structured, uses pull-payment correctly, and follows checks-effects-interactions throughout most paths. Two substantive vulnerabilities were found:

- **SA-1 (HIGH)**: ETH sent as dispute-fee is permanently trapped when DisputeArbitration is not configured or when the DA external call fails (caught by try/catch).
- **SA-2 (MEDIUM)**: `resolveDisputeDetailed` is `onlyOwner` but lacks `nonReentrant`; an external call to DA occurs after all state writes but before the final event.

Three LOW/INFO findings round out the report.

---

## Findings

---

### SA-1
```
ID: SA-1
Severity: HIGH
Title: Dispute fee ETH permanently trapped when DA not configured or DA call fails
Location: SubscriptionAgreement.sol L444–458, L594–611
Description:
  `disputeSubscription` is `payable` — subscribers may forward ETH as a fee
  for the DisputeArbitration contract. In `_callOpenFormalDispute`, two code
  paths silently trap the ETH with no recovery mechanism:

  Path A — DA not configured (disputeArbitration == address(0)):
    The function returns early at L599 before forwarding msg.value. The ETH
    has already been transferred into SubscriptionAgreement. No withdrawal
    path exists for these funds; they are permanently locked.

  Path B — DA call reverts (caught by try/catch at L601–610):
    `{value: msg.value}` is part of the external call. If the call reverts,
    EVM returns the ETH to the calling contract (SubscriptionAgreement), not
    to msg.sender. The try/catch swallows the revert. The ETH is now in
    SubscriptionAgreement with no pendingWithdrawals entry and no withdrawal
    path — permanently lost.

  Both cases represent a direct, irreversible loss of user funds.

Recommendation:
  Path A: If disputeArbitration == address(0), require msg.value == 0 OR
          refund msg.value to msg.sender before returning.
  Path B: Track DA call success; if it fails and msg.value > 0, refund
          msg.sender. Use a local bool flag around the try/catch.

  Simplest safe fix (implemented in Pass 2):
    - In _callOpenFormalDispute, if no DA: require msg.value == 0.
    - Wrap DA call; on catch, refund msg.value to msg.sender.

Status: FIXED (Pass 2)
```

---

### SA-2
```
ID: SA-2
Severity: MEDIUM
Title: resolveDisputeDetailed missing nonReentrant — event emitted after external call
Location: SubscriptionAgreement.sol L471–521
Description:
  `resolveDisputeDetailed` is `onlyOwner` but not `nonReentrant`. It makes
  an external call to DisputeArbitration.resolveDisputeFee (L515–517) inside
  a try/catch and then emits `DetailedDisputeResolved` after the call (L520).

  While the critical state mutations (s.active=false, s.consumed=s.deposited,
  pendingWithdrawals credits) happen before the external call — so a reentrant
  call via the DA cannot double-settle — the missing `nonReentrant` guard is a
  defense-in-depth gap. If disputeArbitration is ever pointed to a malicious
  contract (e.g. after a compromised owner key), a reentrant path back into
  resolveDisputeDetailed could be explored. Additionally, Slither flags the
  event-after-external-call pattern as reentrancy-events.

  The owner-only modifier significantly limits the blast radius, but the guard
  should be present on all state-changing functions that make external calls.

Recommendation:
  Add `nonReentrant` to `resolveDisputeDetailed`. This also moves the event
  back into the re-entrancy-safe window (or keep it after the external call
  since state is already finalized — the guard prevents re-entry regardless).

Status: FIXED (Pass 2)
```

---

### SA-3
```
ID: SA-3
Severity: LOW
Title: subscriberCount slot permanently occupied during HUMAN_REVIEW_REQUIRED disputes
Location: SubscriptionAgreement.sol L480–483
Description:
  When `resolveDisputeDetailed` is called with outcome HUMAN_REVIEW_REQUIRED,
  the function emits the event and returns early without decrementing
  `o.subscriberCount`. The subscription remains active=true, disputed=true.

  For offerings with a non-zero maxSubscribers cap, this means a slot is
  permanently occupied until the owner calls resolveDisputeDetailed again
  with a definitive outcome. A malicious or uncooperative subscriber could
  dispute immediately after subscribing, forcing the owner to intervene, and
  if the owner selects HUMAN_REVIEW_REQUIRED (to escalate to an external
  process), the slot is blocked for an indefinite period.

  Under a tight cap (e.g. maxSubscribers=1 for exclusive content), this
  effectively DoS-es the offering until the owner resolves definitively.

Recommendation:
  Decrement `o.subscriberCount` on HUMAN_REVIEW_REQUIRED so the slot is
  freed for new subscribers. The subscription remains tracked (for eventual
  resolution of funds), but the access/count accounting reflects that the
  subscription is frozen and no longer providing service. Add a guard in
  resolveDisputeDetailed so that subsequent calls on an already-resolved
  subscription revert (check s.disputed is still true).

  (Not auto-fixed — requires design decision on access semantics.)

Status: OPEN
```

---

### SA-4
```
ID: SA-4
Severity: LOW
Title: hasAccess returns true for disputed subscriptions within the paid period
Location: SubscriptionAgreement.sol L562–566
Description:
  `hasAccess` checks only `block.timestamp <= subscriptions[subId].currentPeriodEnd`.
  A disputed subscription (s.disputed=true) still satisfies this condition
  during its current paid period, so the daemon will serve content.

  In most designs this is intentional — the subscriber paid for the period and
  the dispute is about future billing. However it creates an information
  asymmetry: a subscriber who disputes (potentially fraudulently) continues to
  receive service during the dispute resolution window.

  Providers expecting hasAccess to mean "no active dispute" should use
  isActiveSubscriber instead — but isActiveSubscriber only checks
  `!s.cancelled`, not `!s.disputed`.

Recommendation:
  Document explicitly in NatSpec that hasAccess does NOT check disputed state.
  Consider adding a `hasAccessStrict` view that returns false for disputed
  subscriptions. Alternatively update isActiveSubscriber to also gate on
  !s.disputed. (Design call — not auto-fixed.)

Status: OPEN (documented)
```

---

### SA-5
```
ID: SA-5
Severity: INFO
Title: Slither: unused return value from openDispute (intentional)
Location: SubscriptionAgreement.sol L601–610
Description:
  openDispute returns uint256 feeRequired, which is ignored in the try/catch.
  This is intentional — the DA fee is forwarded as msg.value; the return value
  indicates any surplus/shortfall but the subscription contract cannot act on
  it without a refund mechanism. The try/catch already handles the failure case.

Recommendation:
  No change required. Add a NatSpec comment explaining the return value is
  intentionally ignored (feeRequired is for DA internal accounting).

Status: ACCEPTED / DOCUMENTED
```

---

### SA-6
```
ID: SA-6
Severity: INFO
Title: Slither: timestamp comparisons for renewal/access (inherent)
Location: SubscriptionAgreement.sol L358, L555, L565
Description:
  block.timestamp can be manipulated by validators by up to ~12 seconds.
  For renewal logic (minimum period is likely days or weeks) this has no
  practical impact. For access control, a 12-second drift in a 30-day period
  is negligible.

Recommendation:
  No action needed. Document as accepted risk in NatSpec.

Status: ACCEPTED
```

---

### SA-7
```
ID: SA-7
Severity: INFO
Title: Slither: setDisputeArbitration missing zero-address check (intentional)
Location: SubscriptionAgreement.sol L223
Description:
  Slither flags that setDisputeArbitration(address(0)) is allowed. This is
  intentional — address(0) is the sentinel value meaning "no DA configured,
  use owner-only dispute resolution."

Recommendation:
  Add NatSpec clarification: "Pass address(0) to disable DisputeArbitration."

Status: ACCEPTED / DOCUMENTED
```

---

## Automated Tool Summary

### forge test (baseline)
- **59 tests, 0 failed** — full suite passes

### slither findings mapped
| Slither Detector | Finding | Disposition |
|---|---|---|
| unused-return | openDispute return ignored | SA-5 (INFO/ACCEPTED) |
| missing-zero-check | setDisputeArbitration | SA-7 (INFO/ACCEPTED) |
| reentrancy-events | resolveDisputeDetailed | SA-2 (MEDIUM/FIXED) |
| timestamp | renewSubscription, hasAccess, isActiveSubscriber | SA-6 (INFO/ACCEPTED) |
| assembly | OZ SafeERC20, StorageSlot | Library code, N/A |
| pragma | OZ libs use wide version ranges | Library code, N/A |
| low-level-calls | withdraw ETH via .call | Intentional pull-payment |

---

## Security Properties Verified

| Property | Status |
|---|---|
| Pull-payment invariant: sum(pendingWithdrawals) ≤ contract balance | ✓ Holds |
| No reentrancy on renew/cancel/withdraw | ✓ nonReentrant + CEI |
| SA-2 self-dealing prevention | ✓ subscriber != provider |
| SA-3 exact ETH deposit (no overpayment) | ✓ msg.value == total |
| SA-6 maxSubscribers cap enforcement | ✓ at subscribe time |
| Cross-chain replay risk | ✓ No signatures used |
| Fee-on-transfer token support | N/A (explicitly unsupported) |
| Owner cannot steal subscriber funds via dispute | ✓ SPLIT dust → subscriber |
| Provider deactivation during active subs | ✓ Existing subs continue |
| Double-subscription blocked | ✓ AlreadyActive guard |
| subscriberCount decrement on cancel/expire/resolve | ✓ (except HUMAN_REVIEW — SA-3) |

---

## Pass Summary

| Pass | Action | Result |
|---|---|---|
| 1 | Review + Slither + manual audit | 2 fixable (HIGH+MEDIUM), 2 LOW, 3 INFO |
| 2 | Fix SA-1 (HIGH) + SA-2 (MEDIUM) | Applied |
| 3 | Extend test suite | Tests added |
| 4 | Attacker PoC suite | All attacks FAIL (prevented) |
| 5 | forge test all | All pass |

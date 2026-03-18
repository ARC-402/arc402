# ARC-402 User Journey Audit — 2026-03-18

**Auditor:** Claude Sonnet 4.6 (autonomous audit)
**Scope:** Pre-beta launch — silent failures, missing preconditions, confusing errors
**Contracts reviewed:** ARC402Wallet, PolicyEngine, AgentRegistry, ServiceAgreement, IntentAttestation
**CLI reviewed:** wallet.ts, agent.ts, hire.ts, deliver.ts, accept.ts, verify.ts, dispute.ts, migrate.ts, policy.ts, bundler.ts

---

## Method

For each journey, every contract call is traced in sequence. Findings are tagged:
- **GAP** — missing precondition check
- **UNCLEAR ERROR** — error message not actionable for a developer
- **MISSING COMMAND** — no CLI path exists
- **SECURITY RISK** — exploitable or dangerous behavior
- Severity: **P0** blocks launch / **P1** bad UX / **P2** nice to fix

---

## Journey 1: Fresh Wallet Onboarding

**Steps:** deploy wallet → register PolicyEngine → enable DeFi → set categories → authorize machine key → register agent → test first spend

### Step 1: `arc402 wallet deploy`

Calls `WalletFactory.createWallet(entryPoint)`. Constructor automatically calls:
- `ITrustRegistry.initWallet(address(this))`
- `IPolicyEngine(pe).registerWallet(address(this), owner)`
- `IPolicyEngine(pe).enableDefiAccess(address(this))`

This means Steps 2 and 3 (registerWallet + enableDefiAccess) are handled by the constructor for all deploy paths. The onboarding ceremony in the CLI skips them if already done. ✓

**GAP P0 — J1-01: `--sponsored` deploy skips onboarding ceremony entirely**

The WalletConnect and private-key deploy paths both call `runWalletOnboardingCeremony()` after deploy. The `--sponsored` (ERC-4337 + paymaster) path **does not**. After sponsored deploy, no `setCategoryLimitFor` calls are made.

- `PolicyEngine.validateSpend` returns `(false, "PolicyEngine: category not configured")` when `categoryLimits[wallet][category] == 0`.
- All `executeSpend` and `executeTokenSpend` calls silently fail on a sponsored-deployed wallet.
- The code has a comment acknowledging this: *"A factory upgrade with explicit owner param is needed..."* but the onboarding gap is not surfaced to the user.
- **Impact:** Any agent deployed via the sponsored path cannot spend anything. No error at deploy time, failure only surfaces at first spend.
- **Fix:** Call `runWalletOnboardingCeremony()` (or equivalent) in the sponsored deploy path before exiting, or block the path with an explicit warning.

### Step 2–3: Register PolicyEngine + Enable DeFi

Handled by constructor. Onboarding ceremony checks and skips if done. ✓

**GAP P1 — J1-02: Onboarding ceremony sets per-tx limits only, no daily limits or velocity limits**

`runWalletOnboardingCeremony` calls `setCategoryLimitFor` for 4 categories (general, compute, research, protocol). It does not set:
- `dailyCategoryLimit` → defaults to 0 (unlimited) — functionally fine but no guardrails
- `maxTxPerHour` / `maxSpendPerHour` → defaults to 0 (disabled) — velocity protection absent

No CLI guidance tells developers these exist. A developer who wants velocity protection must discover `PolicyEngine` setters independently.

### Step 4: Set Categories

Done by onboarding ceremony for hardcoded categories. ✓

**GAP P1 — J1-03: No standalone `open-context` / `attest` CLI commands**

The only way to open a context and attest before an arbitrary spend is via `wallet drain` (which embeds the full flow) or raw `wallet contract-interaction`. Developers building custom spend flows have no guided CLI path for:
- `wallet open-context <contextId> <taskType>`
- `wallet attest <attestationId> <recipient> <amount> ...`
- `wallet execute-spend <recipient> <amount> <category> <attestationId>`
- `wallet close-context`

### Step 5: Authorize Machine Key

`arc402 wallet authorize-machine-key <key>` exists. Calls `authorizeMachineKey`, which uses `onlyOwner` — correctly requires WalletConnect (phone wallet signs). ✓

**MISSING COMMAND P1 — J1-04: No `revoke-machine-key` CLI command**

`ARC402Wallet.revokeMachineKey(address key)` exists on-chain. There is **no** `arc402 wallet revoke-machine-key` CLI command. This directly blocks Journey 5 (machine key rotation on compromise). A developer who suspects key compromise has no fast revocation path via CLI.

### Step 6: Register Agent

`arc402 agent register` → calls `AgentRegistry.register` via wallet or EOA. ✓

**GAP P2 — J1-05: No pre-check that wallet has enough ETH for gas**

`agent register` does not check wallet ETH balance before sending. On a freshly-deployed wallet with no funding, the transaction fails with a gas-related revert with no helpful CLI message.

### Step 7: Test First Spend

`wallet drain` provides the full flow: check context → close stale → openContext → attest → executeSpend → closeContext.

**UNCLEAR ERROR P1 — J1-06: Custom errors give no diagnostic context**

`ARC402Wallet` uses custom 4-byte errors throughout. A developer calling contract functions programmatically (not via `drain`) gets errors with no text:

| Error    | Triggered when                                  | What developer needs to know |
|----------|------------------------------------------------|-------------------------------|
| `WCtx()` | `openContext` called while one is open; or `executeSpend` called without open context | "A context is already open" / "No context is open" |
| `WAtt()` | Attestation not found / expired / already used / wrong params | Need to distinguish these four cases |
| `WVel()` | Velocity limit breach (wallet-level) | Wallet is now FROZEN — action required |
| `WCall()` | `executeContractCall` target call failed | Need reason from inner call |
| `WZero()` | Various zero-address guards | Which argument was zero? |

These are currently undecipherable from a transaction revert alone. The error selector must be manually looked up.

**GAP P0 — J1-07: `wallet drain` is ETH only — no USDC autonomous spend path**

`executeTokenSpend` exists on-chain but no CLI command covers the machine-key USDC spend flow (openContext → attest → executeTokenSpend → closeContext). If a wallet holds USDC and the agent needs to make an autonomous payment, there is no CLI path.

---

## Journey 2: Hire an Agent (Service Requester)

**Steps:** discover agent → open context → create service agreement → fund escrow → wait for delivery → accept → release payment

### Step 1: Discover Agent

`arc402 discover` exists. ✓

### Step 2: Open Context (Client Side)

Client's wallet does **not** need an open context for `propose`. `executeContractCall` (which `hire` uses via wallet path) does not have a `requireOpenContext` modifier. ✓

### Step 3: `arc402 hire --agent <addr> ...`

Calls `ServiceAgreement.propose(...)` with ETH or USDC.

**GAP P0 — J2-01: No pre-check that ServiceAgreement allows the token**

`ServiceAgreement.propose` reverts `TokenNotAllowed()` if `!allowedTokens[token]`. Only ETH (`address(0)`) is allowed by default in the constructor. USDC must be added by the SA owner via `allowToken()`.

- The `hire` command does not check `allowedTokens[token]` before sending.
- The developer gets a cryptic `TokenNotAllowed()` custom error with no hint that the token must be whitelisted by a protocol admin.
- **Impact:** Every USDC hire attempt on a fresh deployment fails silently.
- **Fix:** Pre-flight read of `allowedTokens[token]` and user-friendly error message.

**GAP P1 — J2-02: No pre-check that provider is a registered active agent**

`hire` does not check `AgentRegistry.isActive(provider)` before proposing. A typo in the agent address funds an escrow with no counterparty able to accept it. The ETH/USDC is locked until deadline expires.

**UNCLEAR ERROR P1 — J2-03: `ClientEqualsProvider()` revert is raw**

If `--agent` is accidentally set to the caller's own address, the revert `ClientEqualsProvider()` has no helpful CLI output.

### Step 4: Fund Escrow

For ETH: `{value: price}` is forwarded. ✓
For USDC (wallet path): `executeContractCall` pre-approves SA for `price`, calls `propose`, then resets approval to 0. ✓

### Step 5–6: Wait for Delivery → Accept

Provider calls `arc402 accept <id>`. ✓

### Step 7: `arc402 verify <id>`

Calls `verifyDeliverable`. ✓ `arc402 verify <id> --auto` calls `autoRelease` after verify window. ✓

**UNCLEAR ERROR P1 — J2-04: `verify` on non-PENDING_VERIFICATION agreement gives raw error**

`verifyDeliverable` reverts `InvalidStatus()`. No CLI pre-check of agreement status before calling.

---

## Journey 3: Agent Receives Work and Delivers (Service Provider)

**Steps:** receive hire request → open context → do work → deliver → wait for acceptance → receive payment

### Step 1–2: Receive hire request

Provider discovers agreement via `arc402 agreements --as provider`. ✓

### Step 3: `arc402 accept <id>`

Calls `ServiceAgreement.accept`. Requires `msg.sender == ag.provider && ag.status == PROPOSED`. ✓

### Step 4: `arc402 deliver <id>`

Calls `commitDeliverable`. Sets status to `PENDING_VERIFICATION`, starts 3-day verify window. ✓

**GAP P1 — J3-01: `deliver` does not check deadline before sending**

`commitDeliverable` reverts `PastDeadline()` if `block.timestamp > ag.deadline`. The CLI does not pre-check the deadline. Developer sees a raw revert after paying gas.

### Step 5: Wait for Acceptance / Auto-Release

`autoRelease` is callable by anyone after verify window. ✓ (`arc402 verify <id> --auto`)

### Step 6: Receive Payment via executeSpend

Payment is received from ServiceAgreement escrow release (no wallet action needed). ✓

**GAP P1 — J3-02: `fulfill` legacy path not blocked clearly**

`arc402 deliver <id> --fulfill` uses the legacy `fulfill()` function which requires `legacyFulfillEnabled == true` and the provider to be in `legacyFulfillProviders`. On a new deployment both are false. The error `LegacyFulfillDisabled()` gives no hint to use `commitDeliverable` instead. CLI output says "legacy fulfill mode is compatibility-only" but doesn't mention this requires admin configuration.

---

## Journey 4: Dispute Flow

**Steps:** agreement in progress → dispute raised → arbitrator assigned → evidence submitted → decision → fund distribution

### Step 1: Raise Dispute — `arc402 dispute open <id> --reason "..."`

Calls `ServiceAgreement.dispute()` → `_callOpenFormalDispute()` → `IDisputeModule(disputeModule).openFormalDispute(...)`.

**GAP P0 — J4-01: No pre-check that `disputeModule` is configured**

If `disputeModule == address(0)` (which is the default on a fresh ServiceAgreement deploy), all dispute calls revert `NoDisputeModule()`. The CLI has no pre-flight check.

- **Impact:** Every dispute attempt on a fresh deployment fails. Developer does not know they need to configure `disputeModule`.
- **Fix:** Pre-flight `require(disputeModule != address(0))` message in CLI, or `dispute open` should check and explain.

**GAP P1 — J4-02: Dispute fee not prompted in default `dispute open`**

`ServiceAgreement.dispute()` is `external payable`. DisputeArbitration may require a fee. The default `dispute open` command passes `msg.value = 0`. If a fee is required, the dispute call fails silently with no CLI guidance to use `--fee`.

Only `dispute open-with-mode` has `--fee`. The simpler `dispute open` (which most developers will use first) doesn't expose fee payment.

### Step 2: Arbitrator Assignment — `arc402 dispute nominate <id> --arbitrator <addr>`

Calls `nominateArbitrator`. `approvedArbitrators[arbitrator]` must be true (set by SA owner). Panel requires 3 arbitrators.

**GAP P1 — J4-03: No pre-check that arbitrator is approved**

`nominateArbitrator` calls `DisputeModule.nominateArbitrator` which should check `approvedArbitrators`. But the CLI doesn't pre-check this. If the nominated address is not approved, the call fails with an unclear error after gas is spent.

**GAP P1 — J4-04: Arbitration selection window is 3 days — no CLI reminder**

After dispute is opened, both parties have 3 days (`ARBITRATION_SELECTION_WINDOW`) to nominate a 3-person panel. There's no CLI reminder or deadline display when opening a dispute.

### Step 3: Evidence Submission

`arc402 dispute evidence <id> --type transcript --file <path>` ✓

### Step 4–5: Vote and Decision

`arc402 dispute vote <id> --vote provider|refund|split` ✓ (only arbitrators can vote, but CLI doesn't verify caller is a panel member)

**GAP P1 — J4-05: Voter not pre-checked**

`castArbitrationVote` reverts `NotPanelArbitrator()` if caller is not on the panel. CLI doesn't pre-check. Gas is wasted.

### Step 6: Fund Distribution

Handled automatically by `_applyFinalizeResult` on majority vote. ✓

---

## Journey 5: Machine Key Rotation (Security)

**Steps:** suspect compromise → revoke old key → authorize new key → resume operations

### Step 1: Emergency Response

`arc402 wallet freeze --drain` ← calls `ARC402Wallet.freezeAndDrain(tokens)` via guardian key. ✓

**GAP P0 — J5-01: No `revoke-machine-key` CLI command**

`ARC402Wallet.revokeMachineKey(address key)` exists on-chain. There is **no** CLI command to call it. A developer who has a compromised machine key must either:
1. Freeze the wallet (via guardian) — stops all spending, including legitimate ops
2. Use raw contract interaction

Without `revoke-machine-key`, the only response to a compromised key is a full wallet freeze, which is disruptive and requires a WalletConnect unfreeze by the owner. This is a critical gap in the security response flow.

### Step 2: Authorize New Key

`arc402 wallet authorize-machine-key <newKey>` works but **requires** WalletConnect (owner must approve). ✓

**GAP P1 — J5-02: No CLI to list currently authorized machine keys**

There's no `arc402 wallet list-machine-keys` command. A developer cannot verify which keys are authorized without checking contract state manually. After a rotation, there's no confirmation of the old key being revoked.

### Step 3: Resume Operations

After unfreeze + new key authorization, operations resume. ✓

**GAP P1 — J5-03: No pre-check that new machine key is authorized before first spend**

`wallet drain` does check `authorizedMachineKeys[machineKey.address]` before proceeding ✓, but standalone programmatic calls to `openContext` / `executeSpend` do not. The error `WAuth()` (4 bytes, no message) gives no actionable hint.

---

## Journey 6: Wallet Migration (Registry Upgrade)

**Steps:** proposeRegistryUpdate → wait 2-day timelock → executeRegistryUpdate → verify all operations still work

### Step 1: `arc402 wallet upgrade-registry <newAddr>`

Calls `ARC402Wallet.proposeRegistryUpdate(newRegistry)`. Checks `pendingRegistry == address(0)` first (fails with `WPending()` if another proposal is in flight). ✓

The CLI shows the timelock unlock time and next steps. ✓

### Step 2: Wait 2 Days

`WLock()` custom error on early execution. The CLI `execute-registry-upgrade` pre-reads `registryUpdateUnlockAt` and shows remaining time if timelock is active. ✓

### Step 3: `arc402 wallet execute-registry-upgrade`

Calls `ARC402Wallet.executeRegistryUpdate()`. ✓

**MISSING COMMAND P0 — J6-01: `cancel-registry-upgrade` CLI command is mentioned but does not exist**

The `upgrade-registry` command output reads:
```
To cancel before execution:
  arc402 wallet cancel-registry-upgrade
```

But this command does **not exist** in `wallet.ts`. The code around line 1212 has a comment block `// ─── cancel-registry-upgrade` followed immediately by `// ─── whitelist-contract` — the command implementation is absent.

- `ARC402Wallet.cancelRegistryUpdate()` exists on-chain (uses `onlyEntryPointOrOwner`).
- A developer who proposes a bad registry upgrade (e.g., phishing attempt with a malicious registry address) has no CLI path to cancel it.
- **Impact:** Full loss of the 2-day cancel window. The developer must either wait 2 days and not execute, or use raw contract interaction.

### Step 4: Verify Operations Post-Migration

**GAP P1 — J6-02: No post-migration verification step**

After `executeRegistryUpdate`, all `_resolveContracts()` calls resolve through the new registry. If the new registry has misconfigured addresses (e.g., wrong PolicyEngine address), all subsequent spends silently fail. There is no CLI step to validate the new registry's contract addresses are reachable and correctly configured.

---

## Journey 7: Context Lifecycle Edge Cases

### Edge Case 1: Context left open and wallet called again

`openContext` has `if (contextOpen) revert WCtx()`. ✓ Correct behavior.

`check-context` and `close-context` CLI commands exist. ✓

**UNCLEAR ERROR P1 — J7-01: `WCtx()` is a bare 4-byte error**

A developer calling `openContext` programmatically when one is already open gets `WCtx()`. No message. The fix message in `wallet close-context` output is helpful when using the CLI, but programmatic users get nothing.

### Edge Case 2: `attest` called but `executeSpend` never happens (attestation expires)

Attestation with `expiresAt > 0` will fail `verify()` after expiry → `WAtt()` revert on `executeSpend`.

**UNCLEAR ERROR P1 — J7-02: `WAtt()` cannot distinguish between 4 failure modes**

`WAtt()` is thrown when `IntentAttestation.verify()` returns `false`. That can mean:
1. Attestation ID not found
2. Attestation already consumed (`used[attestationId] == true`)
3. Attestation expired (`block.timestamp > expiresAt`)
4. Parameter mismatch (wallet, recipient, amount, or token doesn't match)

All four produce the same 4-byte error. A developer debugging a spend failure cannot determine the cause without separately calling `getAttestation()` and `isExpired()`.

### Edge Case 3: `executeSpend` called twice with the same `attestationId`

`consume(attestationId)` marks `used[attestationId] = true`. Second call returns `WAtt()`. ✓ (correct behavior, but see J7-02 for error clarity)

### Critical Design Issue: Context ID Consumed After First Spend

**GAP P0 — J7-03: PolicyEngine marks contextId as "used" after first `recordSpend` — only ONE spend per open context is allowed**

`PolicyEngine.recordSpend` unconditionally sets `_usedContextIds[contextId] = true` after the first successful spend. `validateSpend` then returns `(false, "PolicyEngine: contextId already used")` for all subsequent calls.

This means: **an open wallet context supports exactly one `executeSpend` call**. The wallet's `contextOpen = true` remains, but all further spends fail.

- Developers who naturally assume "open context → many spends → close context" will be confused.
- The error message "PolicyEngine: contextId already used" is clear but the precondition (one spend per context) is not documented anywhere in the CLI or contract NatSpec.
- **Impact:** Any workflow that attempts multiple spends within a single context silently fails after the first. The developer must: close context, open new context, attest, spend for each payment.
- **Fix:** Document this constraint clearly; consider whether single-spend-per-context is the intended design.

---

## Journey 8: PolicyEngine Limits

### When Per-Tx Limit Exceeded

`validateSpend` returns `(false, "PolicyEngine: amount exceeds per-tx limit")`. Propagated to developer as revert string via `_validateSpendPolicy`. **Clear. ✓**

### When Daily Limit Reached

Returns `(false, "PolicyEngine: daily limit exceeded")`. Clear. ✓

**GAP P1 — J8-01: Daily limit uses 12-hour buckets — misleading name**

The "daily" limit uses a two-bucket 12-hour rolling window. The effective limit is 1.5× the configured value at bucket boundaries, not strictly 24 hours. A developer who sets a "daily" limit of 1 ETH may see 1.5 ETH flow in a 24-hour window. The error message says "daily limit exceeded" but the semantics are a rolling window. Not documented in CLI `wallet policy set-limit`.

### When Velocity Freeze Triggered (Wallet-Level)

`ARC402Wallet._triggerVelocityFreeze()` atomically freezes the wallet and reverts `WVel()`.

**UNCLEAR ERROR P0 — J8-02: Velocity breach silently freezes wallet with no diagnostic output**

When `velocityLimit` is configured and a spend exceeds it:
1. `frozen = true` is set
2. `WalletFrozen` event is emitted
3. Transaction reverts `WVel()`

The developer receives a 4-byte error with no message. They don't know:
- What `WVel()` means
- That their wallet is now frozen
- That they need to call `arc402 wallet unfreeze` via WalletConnect to resume

There is also a **behavioral asymmetry**: PolicyEngine velocity limits (`maxTxPerHour`, `maxSpendPerHour`) return readable strings and do NOT freeze the wallet. Wallet-level velocity (`velocityLimit`) uses a 4-byte error AND freezes the wallet. Developers who configure both will be surprised by the asymmetric behavior.

**GAP P1 — J8-03: No CLI command to configure or view wallet-level velocity limit**

`ARC402Wallet.setVelocityLimit(limit)` is a governance op (WalletConnect required). There is no `arc402 wallet set-velocity-limit` or `arc402 wallet show-velocity-limit` command. A developer who wants to use this feature must use `wallet contract-interaction`.

### When Both Layers of Velocity Configured

PolicyEngine velocity (`maxTxPerHour`) applies first in `validateSpend`. If that passes, the wallet velocity check runs in `_checkEthVelocity`. Both can fail, with different error behaviors (string vs freeze). This dual-layer is not documented.

---

## Priority Fix List

### P0 — Blocks Launch

| ID | Issue | File | Fix |
|----|-------|------|-----|
| J1-01 | `--sponsored` deploy skips onboarding ceremony | `wallet.ts` | Call `runWalletOnboardingCeremony()` in sponsored path, or block sponsored path with explicit note |
| J1-07 | No USDC autonomous spend path (no `executeTokenSpend` via machine key CLI) | `wallet.ts` | Add `wallet drain-usdc` or extend `wallet drain --token usdc` to cover ERC-20 |
| J2-01 | `hire` doesn't check `allowedTokens[token]` → silent `TokenNotAllowed()` for USDC | `hire.ts` | Pre-flight read `SA.allowedTokens[token]`; human-readable error if false |
| J4-01 | `dispute open` doesn't check `disputeModule != address(0)` → silent `NoDisputeModule()` | `dispute.ts` | Pre-flight check; suggest `arc402 config set disputeModuleAddress` |
| J6-01 | `cancel-registry-upgrade` mentioned in CLI output but command doesn't exist | `wallet.ts` | Implement `wallet cancel-registry-upgrade` command |
| J7-03 | PolicyEngine marks contextId used after first spend — one spend per context; not documented anywhere | `PolicyEngine.sol` + CLI | Add NatSpec, document in CLI help, or allow multi-spend via separate contextId-per-spend design |
| J8-02 | Velocity breach: `WVel()` 4-byte error + silent wallet freeze — developer has no recovery path info | `ARC402Wallet.sol` | Add a wallet-level freeze notification log line in CLI; or replace `WVel()` with a revert string |

### P1 — Bad Developer UX

| ID | Issue | File | Fix |
|----|-------|------|-----|
| J1-04 | No `revoke-machine-key` CLI command | `wallet.ts` | Add `wallet revoke-machine-key <address>` via WalletConnect |
| J1-06 | Custom errors (`WCtx`, `WAtt`, `WVel`, `WCall`, `WAuth`, `WZero`) are undecipherable without ABI lookup | All CLI callers | Add ABI-level error decoding in the shared transaction helper; map 4-byte selectors to human-readable messages |
| J1-03 | No standalone `open-context`, `attest`, `close-context` CLI commands for custom spend flows | `wallet.ts` | Add these as standalone commands (they're already in `drain` inline) |
| J2-02 | `hire` doesn't check provider is active in AgentRegistry | `hire.ts` | Pre-flight `AgentRegistry.isActive(provider)` check |
| J3-01 | `deliver` doesn't check deadline before sending | `deliver.ts` | Pre-flight deadline check; show time remaining |
| J4-02 | Default `dispute open` has no `--fee` option; fails silently if fee required | `dispute.ts` | Add `--fee` to `dispute open`; query `DisputeArbitration.getFeeQuote()` and display it |
| J4-03 | No pre-check that nominated arbitrator is in `approvedArbitrators` | `dispute.ts` | Pre-flight `SA.approvedArbitrators(address)` check |
| J5-01 | No `revoke-machine-key` (duplicate of J1-04, elevated because it's the only security response) | `wallet.ts` | See J1-04 |
| J5-02 | No `list-machine-keys` command | `wallet.ts` | Add `wallet list-machine-keys` (scan `MachineKeyAuthorized`/`MachineKeyRevoked` events) |
| J6-02 | No post-migration verification step after `execute-registry-upgrade` | `wallet.ts` | After execution, read `registry.getContracts()` and confirm addresses are non-zero |
| J7-01 | `WCtx()` bare error gives no diagnostic context | CLI + `ARC402Wallet.sol` | See J1-06 error decoding fix |
| J7-02 | `WAtt()` cannot distinguish 4 failure modes (not found / used / expired / mismatch) | CLI | Add pre-flight calls to `IA.isExpired()` and `IA.used()` before `executeSpend`; decode and surface reason |
| J8-01 | "Daily" limit name misleading — actually 12-hr rolling window with 1.5× effective maximum | `wallet.ts`, docs | Document in `wallet policy show` output and in CLI help text for `set-limit` |
| J8-03 | No CLI to configure/view wallet-level `velocityLimit` | `wallet.ts` | Add `wallet set-velocity-limit <amount>` (governance op via WalletConnect) and `wallet show-velocity-limit` |

### P2 — Nice to Fix

| ID | Issue | File | Fix |
|----|-------|------|-----|
| J1-02 | Onboarding ceremony doesn't set daily limits or velocity — no guidance | `wallet.ts` | Add optional `--with-daily-limits` flag or post-onboard suggestion |
| J1-05 | `agent register` doesn't check wallet ETH balance for gas | `agent.ts` | Pre-flight balance check with minimum threshold warning |
| J3-02 | `--fulfill` legacy path gives no hint it requires admin configuration | `deliver.ts` | Check `SA.legacyFulfillEnabled()` and `SA.legacyFulfillProviders(signer)` before calling |
| J4-04 | No arbitration deadline display when opening dispute | `dispute.ts` | After dispute open, display `ARBITRATION_SELECTION_WINDOW` deadline |
| J4-05 | `dispute vote` doesn't pre-check caller is panel member | `dispute.ts` | Pre-flight `DA.isArbitratorOnPanel(agreementId, signer)` |
| Misc | `wallet drain` attestation ID uses `Date.now()` (ms precision) — possible collision under rapid calls | `wallet.ts` | Use `ethers.randomBytes(32)` for attestation IDs |
| Misc | Dual velocity limit layers (PolicyEngine + wallet) behave asymmetrically with no documentation | Docs | Add explicit documentation and CLI help about the two velocity systems |

---

## Summary Counts

| Severity | Count |
|----------|-------|
| P0       | 7     |
| P1       | 14    |
| P2       | 7     |
| **Total**| **28**|

### Critical Path to Beta Launch

The following P0 issues should be resolved before any beta user touches the system:

1. **J1-01** — Sponsored deploy works end-to-end (onboarding completes)
2. **J2-01** — Hiring an agent with USDC gives a readable error if token not allowed
3. **J4-01** — Disputing gives a readable error if dispute module not configured
4. **J6-01** — Cancel-registry-upgrade command exists (already referenced in CLI output)
5. **J7-03** — One-spend-per-context limitation is documented prominently
6. **J8-02** — Velocity breach freeze gives a developer-readable outcome
7. **J1-07** — USDC drain path exists (blocking for any USDC-native agent workflow)

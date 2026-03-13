# DisputeArbitration Implementation Task

You are implementing the DisputeArbitration layer for ARC-402. This is a precise, spec-locked implementation. Read the existing contracts before writing anything.

## Files to read first
- reference/contracts/ServiceAgreement.sol
- reference/contracts/IServiceAgreement.sol
- reference/contracts/ITrustRegistry.sol
- reference/contracts/TrustRegistry.sol
- reference/sdk/src/types.ts
- reference/sdk/src/agreement.ts
- reference/sdk/src/index.ts
- cli/src/commands/dispute.ts
- List cli/src/commands/ to see all existing commands

---

## 1. NEW: reference/contracts/IDisputeArbitration.sol

Full interface including:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDisputeArbitration {
    enum DisputeMode { UNILATERAL, MUTUAL }
    enum DisputeClass { HARD_FAILURE, AMBIGUITY_QUALITY, HIGH_SENSITIVITY }

    struct DisputeFeeState {
        DisputeMode mode;
        DisputeClass disputeClass;
        address opener;
        address client;
        address provider;
        uint256 feeRequired;        // in tokens, locked at open time
        uint256 openerPaid;
        uint256 respondentPaid;     // for mutual mode only
        uint256 openedAt;
        bool active;
        bool resolved;
    }

    struct ArbitratorBondState {
        uint256 bondAmount;
        uint256 lockedAt;
        bool locked;
        bool slashed;
        bool returned;
    }

    function openDispute(
        uint256 agreementId,
        DisputeMode mode,
        DisputeClass disputeClass,
        address opener,
        address client,
        address provider,
        uint256 agreementPrice,
        address token
    ) external payable returns (uint256 feeRequired);

    function joinMutualDispute(uint256 agreementId) external payable;

    function resolveDisputeFee(uint256 agreementId, uint8 outcome) external;

    function isEligibleArbitrator(address arbitrator) external view returns (bool);

    function acceptAssignment(uint256 agreementId) external payable;

    function triggerFallback(uint256 agreementId) external returns (bool fallbackTriggered);

    function getDisputeFeeState(uint256 agreementId) external view returns (DisputeFeeState memory);

    function getArbitratorBondState(address arbitrator, uint256 agreementId) external view returns (ArbitratorBondState memory);

    function getFeeQuote(uint256 agreementPrice, address token, DisputeMode mode, DisputeClass disputeClass) external view returns (uint256 feeInTokens);

    function setTokenUsdRate(address token, uint256 usdRate18) external;
    function setMinBondFloorUsd(uint256 floorUsd18) external;
    function setFeeFloorUsd(uint256 floorUsd18) external;
    function setFeeCapUsd(uint256 capUsd18) external;
    function setServiceAgreement(address sa) external;
    function setTrustRegistry(address tr) external;
    function setTreasury(address treasury) external;

    event DisputeFeeOpened(uint256 indexed agreementId, DisputeMode mode, DisputeClass disputeClass, uint256 feeRequired, address token);
    event MutualDisputeFunded(uint256 indexed agreementId, address respondent, uint256 respondentFee);
    event DisputeFeeResolved(uint256 indexed agreementId, uint8 outcome, uint256 openerRefund);
    event ArbitratorAssigned(uint256 indexed agreementId, address indexed arbitrator, uint256 bondAmount);
    event ArbitratorBondReturned(uint256 indexed agreementId, address indexed arbitrator, uint256 amount);
    event ArbitratorBondSlashed(uint256 indexed agreementId, address indexed arbitrator, uint256 amount, string reason);
    event ArbitratorFeePaid(uint256 indexed agreementId, address indexed arbitrator, uint256 feeShare);
    event DisputeFallbackTriggered(uint256 indexed agreementId, string reason);
    event TokenRateSet(address indexed token, uint256 usdRate18);
}
```

---

## 2. NEW: reference/contracts/DisputeArbitration.sol

Full implementation. Key logic:

### Fee calculation (USD-denominated, settled in protocol token at open-time admin-set rate)

```
agreementPriceUsd = agreementPrice * 1e18 / tokenUsdRate[token]
rawFeeUsd = agreementPriceUsd * 3 / 100
clampedFeeUsd = clamp(rawFeeUsd, feeFloorUsd, feeCapUsd)   // default $5e18 to $250e18
classMultiplierBps: HARD_FAILURE=10000, AMBIGUITY_QUALITY=12500, HIGH_SENSITIVITY=15000
classFeeUsd = clampedFeeUsd * classMultiplierBps / 10000
finalFeeUsd = min(classFeeUsd, feeCapUsd)   // cap applies after multiplier
feeInTokens = finalFeeUsd * 1e18 / tokenUsdRate[token]
```

IMPORTANT: tokenUsdRate is admin-set (owner-settable mapping per token address). This is NOT a trustless oracle. Document this clearly in NatSpec.

### UNILATERAL mode
- opener pays feeRequired at openDispute (msg.value for ETH, safeTransferFrom for ERC-20)
- On resolveDisputeFee:
  - PROVIDER_WINS (uint8=2): if opener==client, fee consumed; if opener==provider, refund 50% to opener. Remaining goes to arbitrator pool (split 3 ways).
  - CLIENT_REFUND (uint8=3): if opener==provider, fee consumed; if opener==client, refund 50% to opener. Remaining to arbitrator pool.
  - SPLIT (uint8=4 or 5): no refund, fee to arbitrator pool.
  - HUMAN_REVIEW_REQUIRED (uint8=7): no refund, fee held until human resolution or timeout.

### MUTUAL mode
- opener pays feeRequired/2 at openDispute
- respondent (the party who is NOT the opener) calls joinMutualDispute(agreementId) payable within MUTUAL_FUNDING_WINDOW (48 hours)
- if respondent does not pay within window: triggerFallback emits DisputeFallbackTriggered event (human backstop queue)
- No winner reimbursement in mutual mode regardless of outcome
- Fee distribution: equal split to 3 arbitrators after vote completion

### Arbitrator bond
- bondRequired = max(2 * feeRequired, minBondFloorUsd converted to tokens via tokenUsdRate)
- acceptAssignment(agreementId) is called by a nominated arbitrator to post their bond
- Track per-agreement per-arbitrator: use mapping(uint256 => mapping(address => ArbitratorBondState))
- Bond returned on clean completion: arbitrator voted before decisionDeadlineAt
  - Call _returnBond(agreementId, arbitrator) from within resolveDisputeFee when finalizing
- Bond slashed for missed vote deadline:
  - In resolveDisputeFee, after determining which arbitrators voted, slash any who accepted but did NOT vote
  - Use the ServiceAgreement's existing disputeArbitratorVoted mapping if accessible, OR track locally
  - Actually: DisputeArbitration should track its own list of accepted arbitrators per agreement
- onlyOwner function: slashArbitrator(uint256 agreementId, address arbitrator, string calldata reason) for manual rules violation slashing
- Slashed bonds go to treasury address (configurable, defaults to owner)

### Trust writes (called inside resolveDisputeFee via ITrustRegistry)
DisputeOutcome mapping:
- PROVIDER_WINS (2): ITrustRegistry.recordSuccess(provider, client, "dispute", agreementPrice); ITrustRegistry.recordAnomaly(client, provider, "dispute", agreementPrice) -- wait, actually only penalize the loser. Use just: recordAnomaly(loser, winner, ...)? 

Actually correct mapping per spec:
- PROVIDER_WINS: recordSuccess(provider, client, ...) -- provider delivered, trust up
- CLIENT_REFUND: recordAnomaly(provider, client, ...) -- provider failed, trust down
- SPLIT: no write
- HUMAN_REVIEW_REQUIRED: no write
- arbitrator-slashed: recordArbitratorSlash(arbitrator, reason) -- via the new method

Note: trust writes use try/catch (same pattern as ServiceAgreement._updateTrust).

### Fallback
triggerFallback checks:
1. Mutual mode + respondent has NOT paid within MUTUAL_FUNDING_WINDOW after openedAt
2. OR: DisputeArbitration is aware panel is not complete after selectionDeadlineAt (read from ServiceAgreement via interface, or use local tracking)
For freeze-state simplicity: emit DisputeFallbackTriggered event. Owner manually triggers ServiceAgreement.requestHumanEscalation. Document this in NatSpec.

### Constants
```solidity
uint256 public constant MUTUAL_FUNDING_WINDOW = 48 hours;
```

### State variables
```solidity
address public owner;
address public serviceAgreement;
address public trustRegistry;
address public treasury;
mapping(address => uint256) public tokenUsdRate18;  // token => USD rate (1e18 = $1)
uint256 public feeFloorUsd18 = 5e18;    // $5 in 18 decimals
uint256 public feeCapUsd18 = 250e18;    // $250
uint256 public minBondFloorUsd18 = 20e18; // $20
mapping(uint256 => DisputeFeeState) private _disputeFees;
mapping(uint256 => mapping(address => ArbitratorBondState)) private _arbitratorBonds;
mapping(uint256 => address[]) private _acceptedArbitrators; // per-agreement accepted panel
```

---

## 3. MODIFY: reference/contracts/IServiceAgreement.sol

Add these two enums to the interface (after existing enums):
```solidity
enum DisputeMode { UNILATERAL, MUTUAL }
enum DisputeClass { HARD_FAILURE, AMBIGUITY_QUALITY, HIGH_SENSITIVITY }
```

Add `opener` field to DisputeCase struct (find the struct and add the field):
```solidity
address opener;
```

---

## 4. MODIFY: reference/contracts/ServiceAgreement.sol

Four surgical changes:

### A. Add state variable and setter (after trustRegistry declaration area)
```solidity
address public disputeArbitration;

event DisputeArbitrationUpdated(address indexed da);
event DisputeFeeResolutionFailed(uint256 indexed agreementId);

function setDisputeArbitration(address da) external onlyOwner {
    disputeArbitration = da;
    emit DisputeArbitrationUpdated(da);
}
```

### B. Make dispute entry points payable and add fee hook
Change these function signatures to `external payable`:
- `dispute(uint256 agreementId, string calldata reason)`
- `directDispute(uint256 agreementId, DirectDisputeReason directReason, string calldata reason)`
- `escalateToDispute(uint256 agreementId, string calldata reason)`

Add a new function for mode/class selection:
```solidity
function openDisputeWithMode(
    uint256 agreementId,
    IDisputeArbitration.DisputeMode mode,
    IDisputeArbitration.DisputeClass disputeClass,
    string calldata reason
) external payable {
    // validates and opens formal dispute, passing mode/class to DisputeArbitration
    // same eligibility checks as dispute()
}
```

In `_openFormalDispute`, after `_ensureDisputeCase(agreementId, false)`, BEFORE status flip to DISPUTED:
```solidity
_disputeCases[agreementId].opener = msg.sender;

if (disputeArbitration != address(0)) {
    IDisputeArbitration(disputeArbitration).openDispute{value: msg.value}(
        agreementId,
        IDisputeArbitration.DisputeMode.UNILATERAL,  // default; openDisputeWithMode passes explicit
        IDisputeArbitration.DisputeClass.HARD_FAILURE, // default
        msg.sender,
        ag.client,
        ag.provider,
        ag.price,
        ag.token
    );
}
```

For `openDisputeWithMode`, pass the actual mode/class instead of defaults.

### C. Modify nominateArbitrator eligibility check
Replace:
```solidity
require(approvedArbitrators[arbitrator], "ServiceAgreement: arbitrator not approved");
```
With:
```solidity
require(
    disputeArbitration != address(0)
        ? IDisputeArbitration(disputeArbitration).isEligibleArbitrator(arbitrator)
        : approvedArbitrators[arbitrator],
    "ServiceAgreement: arbitrator not eligible"
);
```

### D. Add fee resolution callback in _finalizeDispute
After escrow release calls, before trust writes:
```solidity
if (disputeArbitration != address(0)) {
    try IDisputeArbitration(disputeArbitration).resolveDisputeFee(
        agreementId,
        uint8(outcome)
    ) {} catch {
        emit DisputeFeeResolutionFailed(agreementId);
    }
}
```

Add `import "./IDisputeArbitration.sol";` at top.

---

## 5. MODIFY: reference/contracts/ITrustRegistry.sol

Add one method to the interface:
```solidity
/// @notice Record an arbitrator slash event. Decrements arbitrator trust score.
/// @param arbitrator The arbitrator address being penalized.
/// @param reason Human-readable slash reason ("no-show", "missed-deadline", "rules-violation").
function recordArbitratorSlash(address arbitrator, string calldata reason) external;
```

---

## 6. MODIFY: reference/contracts/TrustRegistry.sol

Add constant and implement new method:
```solidity
uint256 public constant ARBITRATOR_SLASH_DECREMENT = 50;

function recordArbitratorSlash(
    address arbitrator,
    string calldata reason
) external onlyUpdater {
    if (!initialized[arbitrator]) {
        initialized[arbitrator] = true;
        scores[arbitrator] = INITIAL_SCORE;
    }
    uint256 oldScore = scores[arbitrator];
    uint256 newScore = oldScore < ARBITRATOR_SLASH_DECREMENT ? 0 : oldScore - ARBITRATOR_SLASH_DECREMENT;
    scores[arbitrator] = newScore;
    emit ScoreUpdated(arbitrator, oldScore, newScore, reason);
}
```

---

## 7. MODIFY: reference/sdk/src/types.ts

Add:
```typescript
export enum DisputeMode {
  UNILATERAL = 0,
  MUTUAL = 1,
}

export enum DisputeClass {
  HARD_FAILURE = 0,
  AMBIGUITY_QUALITY = 1,
  HIGH_SENSITIVITY = 2,
}

export interface DisputeFeeState {
  mode: DisputeMode;
  disputeClass: DisputeClass;
  opener: string;
  client: string;
  provider: string;
  feeRequired: bigint;
  openerPaid: bigint;
  respondentPaid: bigint;
  openedAt: bigint;
  active: boolean;
  resolved: boolean;
}

export interface ArbitratorBondState {
  bondAmount: bigint;
  lockedAt: bigint;
  locked: boolean;
  slashed: boolean;
  returned: boolean;
}
```

---

## 8. MODIFY: reference/sdk/src/agreement.ts

Add to ServiceAgreementClient:

```typescript
async openUnilateralDispute(
  id: bigint,
  disputeClass: DisputeClass,
  reason: string,
  fee: bigint
): Promise<ethers.TransactionReceipt> {
  const tx = await this.contract.openDisputeWithMode(
    id, DisputeMode.UNILATERAL, disputeClass, reason, { value: fee }
  );
  return tx.wait();
}

async openMutualDispute(
  id: bigint,
  disputeClass: DisputeClass,
  reason: string,
  halfFee: bigint
): Promise<ethers.TransactionReceipt> {
  const tx = await this.contract.openDisputeWithMode(
    id, DisputeMode.MUTUAL, disputeClass, reason, { value: halfFee }
  );
  return tx.wait();
}

async openDisputeWithMode(
  id: bigint,
  mode: DisputeMode,
  disputeClass: DisputeClass,
  reason: string,
  fee: bigint
): Promise<ethers.TransactionReceipt> {
  const isEth = true; // TODO: detect from agreement token
  const tx = await this.contract.openDisputeWithMode(
    id, mode, disputeClass, reason,
    isEth ? { value: fee } : {}
  );
  return tx.wait();
}
```

---

## 9. NEW: reference/sdk/src/dispute-arbitration.ts

Create DisputeArbitrationClient class with methods:
- `getDisputeFeeQuote(agreementId, agreementPrice, token, mode, disputeClass): Promise<bigint>`
- `joinMutualDispute(agreementId: bigint, halfFee: bigint): Promise<ethers.TransactionReceipt>`
- `acceptAssignment(agreementId: bigint, bond: bigint): Promise<ethers.TransactionReceipt>`
- `triggerFallback(agreementId: bigint): Promise<ethers.TransactionReceipt>`
- `isEligibleArbitrator(address: string): Promise<boolean>`
- `getArbitratorBondState(arbitrator: string, agreementId: bigint): Promise<ArbitratorBondState>`
- `getDisputeFeeState(agreementId: bigint): Promise<DisputeFeeState>`
- `setTokenUsdRate(token: string, usdRate18: bigint): Promise<ethers.TransactionReceipt>`

Include the DISPUTE_ARBITRATION_ABI in reference/sdk/src/contracts.ts (or inline it).

---

## 10. MODIFY: reference/sdk/src/index.ts

Export:
- `DisputeArbitrationClient` from `./dispute-arbitration`
- `DisputeMode`, `DisputeClass`, `DisputeFeeState`, `ArbitratorBondState` from `./types`

---

## 11. MODIFY: cli/src/commands/dispute.ts

Add subcommands:
- `fee-quote <agreementId>` with options `--mode <unilateral|mutual>` and `--class <hard-failure|ambiguity|high-sensitivity>` -- prints the fee quote in tokens and approximate USD
- `open-with-mode <agreementId>` with options `--mode`, `--class`, `--reason` -- calls openDisputeWithMode
- `join <agreementId>` -- for respondent in mutual dispute, calls joinMutualDispute

---

## 12. NEW: cli/src/commands/arbitrator.ts

Commands:
- `arbitrator bond status <address> [--agreement <id>]` -- shows bond state
- `arbitrator bond accept <agreementId>` -- calls acceptAssignment with required bond amount
- `arbitrator bond fallback <agreementId>` -- calls triggerFallback
- `arbitrator rate set <tokenAddress> <usdRateInUsd>` -- owner only, sets admin rate (converts to 18 decimal format)

Register this command in the CLI entry point.

---

## Validation

After implementing all files, run these and fix failures before finishing:

```bash
cd /home/lego/.openclaw/workspace-engineering/products/arc-402/reference/sdk && npm test
cd /home/lego/.openclaw/workspace-engineering/products/arc-402/cli && npm test
```

If TypeScript errors exist, fix them. The goal is a clean build and passing tests.

---

## Completion

When all files are implemented and tests pass, run:
```
openclaw system event --text "Done: DisputeArbitration layer complete — IDisputeArbitration, DisputeArbitration, ServiceAgreement updated, TrustRegistry updated, SDK updated, CLI updated" --mode now
```

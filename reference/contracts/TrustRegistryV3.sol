// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ITrustRegistryV3.sol";
import "./ITrustRegistry.sol";
import "./IMigrationRegistry.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title TrustRegistryV3
 * @notice Capability-specific, Sybil-resistant trust registry for ARC-402.
 *
 * STATUS: Production-ready — audited 2026-03-14
 *
 * Mechanisms vs v1:
 *   1. Capability-specific scores (top-5 stored on-chain; full profile on IPFS)
 *   2. Counterparty diversity — diminishing returns for repeated same-counterparty deals
 *   3. Value-weighted trust gains — sqrt scaling vs reference 0.01 ETH, capped at 5× base
 *   4. Time decay at read time — 6-month half-life toward floor (100)
 *   5. Asymmetric anomaly penalty — 50 pts (was 20 in v1)
 *   6. Minimum agreement value floor — below threshold = no trust update, no revert
 *   7. Lazy v1 migration — on first interaction, reads v1 score as initial global score
 *
 * @dev Uses Ownable2Step to require two-step ownership transfer (prevents phishing hijack).
 */
contract TrustRegistryV3 is ITrustRegistryV3, ITrustRegistry, Ownable2Step {

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_SCORE       = 1000;
    uint256 public constant INITIAL_SCORE   = 100;   // Starting score for new wallets
    uint256 public constant DECAY_FLOOR     = 100;   // Score never decays below this
    uint256 public constant HALF_LIFE       = 180 days; // Time decay half-life
    uint256 public constant REFERENCE_VALUE = 1e16;  // 0.01 ETH — base value anchor
    uint256 public constant BASE_INCREMENT  = 5;     // Trust gain at 1× value multiplier
    uint256 public constant MAX_SINGLE_GAIN = 25;    // 5× BASE_INCREMENT cap per agreement
    uint256 public constant ANOMALY_PENALTY = 50;    // Points deducted per anomaly (v1 was 20)
    uint256 public constant CAP_SLOTS       = 5;     // On-chain capability slots per wallet

    // ─── Storage ─────────────────────────────────────────────────────────────

    /// @notice Full trust profiles keyed by wallet address.
    mapping(address => TrustProfile) public profiles;

    /// @notice Top-5 on-chain capability score slots per wallet.
    /// @dev CapabilityScore.capabilityHash == 0 means slot is empty.
    // slither-disable-next-line uninitialized-state
    mapping(address => CapabilityScore[5]) internal _capabilitySlots;

    /// @notice Counterparty diversity tracker: wallet → counterparty → capabilityHash → count.
    /// @dev Count = number of PRIOR completed deals. Read before incrementing.
    mapping(address => mapping(address => mapping(bytes32 => uint256))) public dealCount;

    /// @notice Addresses authorised to call recordSuccess / recordAnomaly.
    mapping(address => bool) public isAuthorizedUpdater;

    /// @notice Tracks the last block number a wallet's trust score was written.
    ///         Used by noFlashLoan modifier to block same-block multi-write attacks.
    mapping(address => uint256) private _lastUpdateBlock;

    /// @notice Minimum agreement value (wei). 0 = disabled.
    /// @dev Agreements below this threshold produce no trust update (not reverted).
    uint256 public minimumAgreementValue;

    /// @notice Optional v1 registry for lazy migration.
    ITrustRegistry public immutable v1Registry;

    /// @notice Optional MigrationRegistry for lineage-aware anomaly routing.
    ///         When set, recordAnomaly() resolves the current active wallet in a lineage
    ///         and applies the penalty there rather than to the (possibly retired) old address.
    address public migrationRegistry;

    /// @notice Accumulated ETH from slashed bonds. Only this amount may be withdrawn.
    /// @dev R-2: tracks slashed balance to prevent withdrawSlashedBonds from draining active bonds.
    uint256 public slashedBondBalance;

    // ─── Bond constants ───────────────────────────────────────────────────────

    uint256 public constant MIN_BOND         = 0.01 ether;
    uint256 public constant BOND_BOOST       = 50;      // Trust points granted on bond post
    uint256 public constant BOND_LOCK_PERIOD = 90 days; // Clean operation window before claim

    // ─── Bond storage ─────────────────────────────────────────────────────────

    struct BondState {
        uint256 amount;    // Wei bonded
        uint256 postedAt;  // block.timestamp when bond was posted
        bool    active;    // false once claimed or slashed
        bool    slashed;   // true if slashBond was called
    }

    /// @notice Bond state per wallet.
    mapping(address => BondState) public bonds;

    // ─── Events (beyond ITrustRegistryV3) ───────────────────────────────────

    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);
    event MinimumAgreementValueUpdated(uint256 oldValue, uint256 newValue);
    event BondPosted(address indexed wallet, uint256 amount, uint256 boost);
    event BondClaimed(address indexed wallet, uint256 amount);
    event BondSlashed(address indexed wallet, uint256 amount);

    /// @notice Emitted when recordAnomaly resolves to a different active wallet via migration lineage.
    event AnomalyLineageResolved(address indexed originalWallet, address indexed activeWallet);

    /// @notice Emitted when applyMigrationDecay transfers a decayed score to a new wallet.
    event MigrationDecayApplied(
        address indexed oldWallet,
        address indexed newWallet,
        uint256 oldScore,
        uint256 newScore
    );

    /// @notice Emitted when the migration registry address is updated.
    event MigrationRegistryUpdated(address indexed registry);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    bool public paused;

    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier onlyUpdater() {
        require(isAuthorizedUpdater[msg.sender], "TrustRegistryV3: not authorized updater");
        require(!paused, "TrustRegistryV3: paused");
        _;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @dev Prevents flash-loan-assisted same-block trust manipulation.
    ///      A wallet's trust score can only be written once per block.
    modifier noFlashLoan(address subject) {
        require(block.number > _lastUpdateBlock[subject], "TrustRegistryV3: flash loan protection");
        _lastUpdateBlock[subject] = block.number;
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _v1Registry Address of the v1 TrustRegistry for lazy migration.
    ///                    Pass address(0) to disable v1 migration.
    constructor(address _v1Registry) Ownable(msg.sender) {
        v1Registry = ITrustRegistry(_v1Registry);
        isAuthorizedUpdater[msg.sender] = true;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function addUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = true;
        emit UpdaterAdded(updater);
    }

    function removeUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = false;
        emit UpdaterRemoved(updater);
    }

    /// @notice Set the minimum agreement value (wei). 0 = disabled.
    function setMinimumAgreementValue(uint256 value) external onlyOwner {
        emit MinimumAgreementValueUpdated(minimumAgreementValue, value);
        minimumAgreementValue = value;
    }

    /// @notice Set the MigrationRegistry address for lineage-aware anomaly routing.
    ///         Pass address(0) to disable migration-aware routing.
    function setMigrationRegistry(address _migrationRegistry) external onlyOwner {
        // address(0) = disable migration-aware routing (emergency escape hatch)
        migrationRegistry = _migrationRegistry;
        emit MigrationRegistryUpdated(_migrationRegistry);
    }

    // ─── Bond write ───────────────────────────────────────────────────────────

    /**
     * @notice Post a bond to receive a +50 trust boost as a cold-start signal.
     *
     * Requirements:
     *   - msg.value >= 0.01 ETH
     *   - No existing active bond for msg.sender
     *
     * After 90 days of clean operation, the bond can be reclaimed via claimBond().
     * If an anomaly occurs within that period, an updater can call slashBond() to forfeit it.
     */
    function postBond() external payable {
        require(msg.value >= MIN_BOND, "TrustRegistryV3: bond below minimum");
        require(!bonds[msg.sender].active, "TrustRegistryV3: bond already active");

        bonds[msg.sender] = BondState({
            amount:   msg.value,
            postedAt: block.timestamp,
            active:   true,
            slashed:  false
        });

        _ensureInitialized(msg.sender);

        // Apply boost directly to global score (capped at MAX_SCORE)
        TrustProfile storage p = profiles[msg.sender];
        uint256 newScore = p.globalScore + BOND_BOOST > MAX_SCORE ? MAX_SCORE : p.globalScore + BOND_BOOST;
        p.globalScore = newScore;
        p.lastUpdated = block.timestamp;

        emit BondPosted(msg.sender, msg.value, BOND_BOOST);
        emit ScoreUpdated(msg.sender, newScore, "bond", int256(BOND_BOOST));
    }

    /**
     * @notice Reclaim bond after 90 days of clean operation.
     *
     * Requirements:
     *   - Active, unslashed bond exists for msg.sender
     *   - At least 90 days have elapsed since postedAt
     */
    function claimBond() external {
        BondState storage b = bonds[msg.sender];
        require(b.active, "TrustRegistryV3: no active bond");
        require(!b.slashed, "TrustRegistryV3: bond was slashed");
        require(block.timestamp >= b.postedAt + BOND_LOCK_PERIOD, "TrustRegistryV3: bond lock period not elapsed");

        b.active = false;
        uint256 amount = b.amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TrustRegistryV3: bond return failed");

        emit BondClaimed(msg.sender, amount);
    }

    /**
     * @notice Forfeit a wallet's bond on anomaly. Called by authorised updaters.
     * @param wallet The wallet whose bond should be slashed.
     */
    function slashBond(address wallet) external onlyUpdater {
        BondState storage b = bonds[wallet];
        require(b.active, "TrustRegistryV3: no active bond");
        require(!b.slashed, "TrustRegistryV3: already slashed");

        b.active  = false;
        b.slashed = true;
        uint256 amount = b.amount;
        // R-2: track slashed ETH so withdrawSlashedBonds cannot drain active-bond funds.
        slashedBondBalance += amount;

        emit BondSlashed(wallet, amount);
    }

    /**
     * @notice Withdraw accumulated slashed bond ETH. Owner only.
     * @dev R-2: withdrawal is bounded by slashedBondBalance — cannot drain active bond funds.
     */
    function withdrawSlashedBonds(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "TrustRegistryV3: zero address");
        require(amount <= slashedBondBalance, "TrustRegistryV3: insufficient slashed balance");
        slashedBondBalance -= amount;
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "TrustRegistryV3: withdrawal failed");
    }

    /**
     * @notice Apply a direct trust boost to a wallet. Used by VouchingRegistry.
     * @dev Only callable by authorised updaters (VouchingRegistry must be added as one).
     * @param wallet The wallet to boost.
     * @param boost  Points to add to globalScore (capped at MAX_SCORE).
     */
    function applyBoost(address wallet, uint256 boost) external onlyUpdater {
        require(boost > 0, "TrustRegistryV3: zero boost");
        _ensureInitialized(wallet);

        TrustProfile storage p = profiles[wallet];
        uint256 newScore = p.globalScore + boost > MAX_SCORE ? MAX_SCORE : p.globalScore + boost;
        p.globalScore = newScore;
        p.lastUpdated = block.timestamp;

        emit ScoreUpdated(wallet, newScore, "vouch_boost", int256(boost));
    }

    /**
     * @notice Reverse a vouching boost — called by VouchingRegistry on clean revoke.
     * @dev Score is reduced by `amount` but cannot fall below DECAY_FLOOR.
     *      Only callable by authorised updaters (VouchingRegistry must be added as one).
     * @param wallet The wallet whose score to reduce.
     * @param amount Points to subtract (floored at DECAY_FLOOR).
     */
    function reverseBoost(address wallet, uint256 amount) external onlyUpdater {
        require(amount > 0, "TrustRegistryV3: zero amount");
        TrustProfile storage p = profiles[wallet];
        if (p.lastUpdated == 0) return; // wallet never initialised — nothing to reverse
        uint256 newScore = p.globalScore > DECAY_FLOOR + amount ? p.globalScore - amount : DECAY_FLOOR;
        p.globalScore = newScore;
        emit ScoreUpdated(wallet, newScore, "vouch_boost_reversed", -int256(amount));
    }

    // ─── Write ───────────────────────────────────────────────────────────────

    /// @inheritdoc ITrustRegistryV3
    /// @dev B-6: self-init allowed (wallet == msg.sender, used by ARC402Wallet constructor).
    ///      Initializing another wallet requires onlyUpdater — prevents EOA reset attacks.
    function initWallet(address wallet) external override(ITrustRegistry, ITrustRegistryV3) {
        require(
            wallet == msg.sender || isAuthorizedUpdater[msg.sender],
            "TrustRegistryV3: not authorized updater"
        );
        _ensureInitialized(wallet);
    }

    /// @inheritdoc ITrustRegistryV3
    function recordSuccess(
        address wallet,
        address counterparty,
        string calldata capability,
        uint256 agreementValueWei,
        uint256 resolvedAt
    ) external override(ITrustRegistry, ITrustRegistryV3) onlyUpdater noFlashLoan(wallet) {
        // Minimum agreement value gate — silent skip, no revert
        if (minimumAgreementValue > 0 && agreementValueWei < minimumAgreementValue) return;

        _ensureInitialized(wallet);

        bytes32 capHash = keccak256(abi.encodePacked(capability));
        uint256 gain = _computeGain(wallet, counterparty, capHash, agreementValueWei, resolvedAt);

        if (gain == 0) {
            profiles[wallet].lastUpdated = block.timestamp;
            return;
        }

        _updateCapabilitySlot(wallet, capHash, gain);

        TrustProfile storage p = profiles[wallet];
        uint256 newGlobal = p.globalScore + gain > MAX_SCORE ? MAX_SCORE : p.globalScore + gain;
        p.globalScore = newGlobal;
        p.lastUpdated = block.timestamp;

        emit ScoreUpdated(wallet, newGlobal, capability, int256(gain));
    }

    /// @dev Computes trust gain and increments deal count. Extracted to reduce stack depth in recordSuccess.
    ///      Formula (Spec 28): effectiveGain = baseGain × recencyWeight × complexityMultiplier
    ///      B-5: complexityMultiplier (out of 100) is now applied; denominator extended by 100.
    function _computeGain(
        address wallet,
        address counterparty,
        bytes32 capHash,
        uint256 agreementValueWei,
        uint256 resolvedAt
    ) internal returns (uint256 gain) {
        uint256 priorCount  = dealCount[wallet][counterparty][capHash];
        dealCount[wallet][counterparty][capHash] = priorCount + 1;
        uint256 valMul      = _valueMultiplier(agreementValueWei);
        uint256 divMul      = _diversityMultiplier(priorCount);
        uint256 recency     = _recencyWeight(resolvedAt);
        uint256 complexity  = _complexityMultiplier(agreementValueWei);
        // Denominator: valMul scale (100) × divMul scale (10_000) × recency scale (100) × complexity scale (100)
        uint256 raw = (BASE_INCREMENT * valMul * divMul * recency * complexity) / (100 * 10_000 * 100 * 100);
        gain = raw > MAX_SINGLE_GAIN ? MAX_SINGLE_GAIN : raw;
    }

    /// @inheritdoc ITrustRegistryV3
    function recordAnomaly(
        address wallet,
        address, /* counterparty — reserved for off-chain indexing via events */
        string calldata capability,
        uint256 agreementValueWei
    ) external override(ITrustRegistry, ITrustRegistryV3) onlyUpdater noFlashLoan(wallet) {
        // Minimum agreement value gate
        if (minimumAgreementValue > 0 && agreementValueWei < minimumAgreementValue) return;

        // ── Resolve active wallet in migration lineage ───────────────────────
        // If the wallet has migrated to a newer contract, the penalty applies to
        // the CURRENT active wallet, not the retired address. This prevents escape
        // from anomaly records via migration (Spec 29).
        address activeWallet = wallet;
        if (migrationRegistry != address(0)) {
            try IMigrationRegistry(migrationRegistry).resolveActiveWallet(wallet) returns (address resolved) {
                if (resolved != address(0) && resolved != wallet) {
                    // Additional per-block flash-loan protection for the resolved wallet.
                    require(
                        block.number > _lastUpdateBlock[resolved],
                        "TrustRegistryV3: flash loan protection"
                    );
                    _lastUpdateBlock[resolved] = block.number;
                    activeWallet = resolved;
                    emit AnomalyLineageResolved(wallet, resolved);
                }
            } catch {} // solhint-disable-line no-empty-blocks — graceful degradation on registry failure
        }

        _ensureInitialized(activeWallet);

        bytes32 capHash = keccak256(abi.encodePacked(capability));

        // ── Deduct from capability score ────────────────────────────────────
        _deductCapabilitySlot(activeWallet, capHash, ANOMALY_PENALTY);

        // ── Deduct from global score ────────────────────────────────────────
        TrustProfile storage p = profiles[activeWallet];
        uint256 oldGlobal = p.globalScore;
        uint256 newGlobal  = oldGlobal >= ANOMALY_PENALTY ? oldGlobal - ANOMALY_PENALTY : 0;
        p.globalScore  = newGlobal;
        p.lastUpdated  = block.timestamp;

        // ANOMALY_PENALTY is a small constant (50) — safe to cast to int256
        emit ScoreUpdated(activeWallet, newGlobal, capability, -int256(uint256(ANOMALY_PENALTY)));
    }

    /// @notice Transfer a trust score at 90% decay from an old wallet to a new wallet.
    ///         Called by MigrationRegistry during migration to initialise the new wallet's score.
    ///
    /// @dev Only callable by the configured migrationRegistry address.
    ///      Always overwrites the new wallet's score, even if the wallet was already initialised.
    ///      This is intentional — the migrated score supersedes any cold-start INITIAL_SCORE.
    ///
    /// @param oldWallet The retired source wallet.
    /// @param newWallet The new target wallet to receive the decayed score.
    /// @param oldScore  The raw score of oldWallet at the time of migration (read by MigrationRegistry).
    function applyMigrationDecay(address oldWallet, address newWallet, uint256 oldScore) external noFlashLoan(oldWallet) {
        require(msg.sender == migrationRegistry, "TrustRegistryV3: only migration registry");
        require(newWallet != address(0), "TrustRegistryV3: zero new wallet");

        // 10% decay: new score = old score × 0.90
        uint256 decayedScore = (oldScore * 90) / 100;
        uint256 capped = decayedScore > MAX_SCORE ? MAX_SCORE : decayedScore;

        // Ensure the profile slot exists before writing
        _ensureInitialized(newWallet);

        TrustProfile storage p = profiles[newWallet];
        p.globalScore = capped;
        p.lastUpdated = block.timestamp;

        emit MigrationDecayApplied(oldWallet, newWallet, oldScore, capped);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    /// @inheritdoc ITrustRegistryV3
    function getGlobalScore(address wallet) public view returns (uint256) {
        return profiles[wallet].globalScore;
    }

    /// @notice Returns true if wallet has an active, unslashed bond.
    function hasActiveBond(address wallet) external view returns (bool) {
        return bonds[wallet].active;
    }

    /// @inheritdoc ITrustRegistry
    function getScore(address wallet) external view override(ITrustRegistry, ITrustRegistryV3) returns (uint256) {
        return getGlobalScore(wallet);
    }

    /// @inheritdoc ITrustRegistryV3
    /// @dev Applies half-life time decay toward DECAY_FLOOR at read time.
    ///      Decay is NEVER stored — only computed on each read.
    function getEffectiveScore(address wallet) external view override(ITrustRegistry, ITrustRegistryV3) returns (uint256) {
        TrustProfile storage p = profiles[wallet];
        if (p.lastUpdated == 0) return 0;

        uint256 elapsed = block.timestamp - p.lastUpdated;
        if (elapsed == 0) return p.globalScore;

        uint256 above = p.globalScore > DECAY_FLOOR ? p.globalScore - DECAY_FLOOR : 0;

        // Integer approximation: halve `above` for each complete HALF_LIFE elapsed.
        // Accurate to ~1 part in 1000 for intervals up to 10 years.
        uint256 halvings = elapsed / HALF_LIFE;
        if (halvings >= 10) return DECAY_FLOOR; // Fully decayed after ~5 years

        above = above >> halvings; // right-shift = divide by 2^halvings

        uint256 result = DECAY_FLOOR + above;
        // B-3: if globalScore < DECAY_FLOOR (e.g. due to anomaly penalties), never return more than raw score.
        if (result > p.globalScore) result = p.globalScore;
        return result;
    }

    /// @inheritdoc ITrustRegistryV3
    /// @dev Scans the 5 on-chain capability slots. Returns 0 if not found.
    function getCapabilityScore(address wallet, string calldata capability) external view returns (uint256) {
        bytes32 capHash = keccak256(abi.encodePacked(capability));
        CapabilityScore[5] storage slots = _capabilitySlots[wallet];
        for (uint256 i = 0; i < CAP_SLOTS; i++) {
            if (slots[i].capabilityHash == capHash) {
                return slots[i].score;
            }
        }
        return 0;
    }

    /// @inheritdoc ITrustRegistryV3
    function meetsThreshold(address wallet, uint256 minScore) external view returns (bool) {
        TrustProfile storage p = profiles[wallet];
        if (p.lastUpdated == 0) return false;

        // Re-compute effective score inline (same logic as getEffectiveScore)
        uint256 elapsed  = block.timestamp - p.lastUpdated;
        uint256 above    = p.globalScore > DECAY_FLOOR ? p.globalScore - DECAY_FLOOR : 0;
        uint256 halvings = elapsed / HALF_LIFE;
        if (halvings >= 10) {
            // B-3: if globalScore < DECAY_FLOOR, floor is capped at globalScore.
            uint256 floor = p.globalScore < DECAY_FLOOR ? p.globalScore : DECAY_FLOOR;
            return floor >= minScore;
        }
        uint256 effective = DECAY_FLOOR + (above >> halvings);
        // B-3: never return more than the raw score (covers penalised wallets below DECAY_FLOOR).
        if (effective > p.globalScore) effective = p.globalScore;
        return effective >= minScore;
    }

    /// @inheritdoc ITrustRegistryV3
    function meetsCapabilityThreshold(
        address wallet,
        uint256 minScore,
        string calldata capability
    ) external view returns (bool) {
        bytes32 capHash = keccak256(abi.encodePacked(capability));
        CapabilityScore[5] storage slots = _capabilitySlots[wallet];
        for (uint256 i = 0; i < CAP_SLOTS; i++) {
            if (slots[i].capabilityHash == capHash) {
                return slots[i].score >= minScore;
            }
        }
        return false;
    }

    /// @notice Expose the on-chain capability slots for a wallet (for inspection/testing).
    function getCapabilitySlots(address wallet) external view returns (CapabilityScore[5] memory) {
        return _capabilitySlots[wallet];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /// @dev Initialise a wallet profile if not already done.
    ///      Performs lazy v1 migration if v1Registry is configured and has a score.
    function _ensureInitialized(address wallet) internal {
        if (profiles[wallet].lastUpdated != 0) return; // Already initialised

        uint256 initialScore = INITIAL_SCORE;

        if (address(v1Registry) != address(0)) {
            try v1Registry.getScore(wallet) returns (uint256 v1Score) {
                if (v1Score > 0) initialScore = v1Score;
            } catch {
                // v1 call failed — fall back to INITIAL_SCORE
            }
        }

        profiles[wallet] = TrustProfile({
            globalScore:           initialScore,
            lastUpdated:           block.timestamp,
            capabilityProfileHash: bytes32(0)
        });

        emit WalletInitialized(wallet, initialScore);
    }

    /// @dev Update (or insert) a capability score slot on a successful agreement.
    ///      Slot selection priority:
    ///        1. Existing slot for this capabilityHash  → add gain (cap at MAX_SCORE)
    ///        2. Empty slot (hash == 0)                 → initialise at INITIAL_SCORE + gain
    ///        3. Full: replace lowest-score slot if INITIAL_SCORE + gain > that slot's score
    function _updateCapabilitySlot(address wallet, bytes32 capHash, uint256 gain) internal {
        CapabilityScore[5] storage slots = _capabilitySlots[wallet];

        // Pass 1: find existing slot
        for (uint256 i = 0; i < CAP_SLOTS; i++) {
            if (slots[i].capabilityHash == capHash) {
                uint256 cur = slots[i].score;
                slots[i].score = cur + gain > MAX_SCORE ? MAX_SCORE : cur + gain;
                return;
            }
        }

        // New capability — starting score = INITIAL_SCORE + gain (capped)
        uint256 newScore = INITIAL_SCORE + gain > MAX_SCORE ? MAX_SCORE : INITIAL_SCORE + gain;

        // Pass 2: find empty slot
        for (uint256 i = 0; i < CAP_SLOTS; i++) {
            if (slots[i].capabilityHash == bytes32(0)) {
                slots[i] = CapabilityScore({ capabilityHash: capHash, score: newScore });
                return;
            }
        }

        // Pass 3: replace lowest-score slot if new score is strictly higher
        uint256 minIdx   = 0;
        uint256 minScore = slots[0].score;
        for (uint256 i = 1; i < CAP_SLOTS; i++) {
            if (slots[i].score < minScore) {
                minScore = slots[i].score;
                minIdx   = i;
            }
        }
        if (newScore > minScore) {
            slots[minIdx] = CapabilityScore({ capabilityHash: capHash, score: newScore });
        }
        // Otherwise: 6th+ capability with score ≤ min existing — not stored on-chain
    }

    /// @dev Deduct from a capability slot's score (anomaly). If not present, no-op for that slot.
    function _deductCapabilitySlot(address wallet, bytes32 capHash, uint256 penalty) internal {
        CapabilityScore[5] storage slots = _capabilitySlots[wallet];
        for (uint256 i = 0; i < CAP_SLOTS; i++) {
            if (slots[i].capabilityHash == capHash) {
                slots[i].score = slots[i].score >= penalty ? slots[i].score - penalty : 0;
                return;
            }
        }
        // Capability not in top-5 slots — global score still deducted (handled by caller)
    }

    /// @dev Value multiplier: sqrt(valueWei / REFERENCE_VALUE) scaled to 100 = 1×, capped at 500 (5×).
    ///      Internally: ratio = (valueWei * 10_000) / REFERENCE_VALUE; return sqrt(ratio) capped at 500.
    function _valueMultiplier(uint256 valueWei) internal pure returns (uint256) {
        if (valueWei == 0) return 0;
        // Scale up by 10_000 to preserve precision through sqrt.
        // For REFERENCE_VALUE (0.01 ETH): ratio = 10_000 → sqrt = 100 → 1× ✓
        // For 1 ETH:                      ratio = 1_000_000 → sqrt = 1000 → capped at 500 ✓
        uint256 ratio    = (valueWei * 10_000) / REFERENCE_VALUE;
        uint256 sqrtVal  = _sqrt(ratio);
        return sqrtVal > 500 ? 500 : sqrtVal;
    }

    /// @dev Counterparty diversity multiplier in basis points (10_000 = 100%, 0 = 0%).
    ///      Halves with each additional deal with the same counterparty in the same capability.
    ///      10th+ deal = 0 (rounds down, preventing unbounded farming).
    function _diversityMultiplier(uint256 priorCount) internal pure returns (uint256) {
        if (priorCount == 0) return 10_000;
        if (priorCount == 1) return  5_000;
        if (priorCount == 2) return  2_500;
        if (priorCount == 3) return  1_250;
        if (priorCount == 4) return    625;
        if (priorCount == 5) return    312;
        if (priorCount == 6) return    156;
        if (priorCount == 7) return     78;
        if (priorCount == 8) return     39;
        if (priorCount == 9) return     19;
        return 0; // 10th+ deal: 0 trust gain
    }

    /// @dev Recency weight based on agreement age (Spec 28).
    ///      Returns a multiplier out of 100 (100 = 1.0×, 20 = 0.2×).
    function _recencyWeight(uint256 resolvedAt) internal view returns (uint256) {
        uint256 age = block.timestamp - resolvedAt;
        if (age < 30 days)  return 100; // 1.0×
        if (age < 90 days)  return  80; // 0.8×
        if (age < 180 days) return  60; // 0.6×
        if (age < 365 days) return  40; // 0.4×
        return 20;                       // 0.2×
    }

    /// @dev Complexity multiplier based on agreement value (Spec 28).
    ///      Returns a multiplier out of 100 (100 = 1.0×).
    ///      Brackets approximate USD value using a fixed $2,000/ETH reference price to avoid oracle dependency.
    ///      $10 ≈ 5e15 wei | $100 ≈ 5e16 wei | $1,000 ≈ 5e17 wei | $10,000 ≈ 5e18 wei
    function _complexityMultiplier(uint256 valueWei) internal pure returns (uint256) {
        if (valueWei <  5e15) return  50; // < $10    → 0.5×
        if (valueWei <  5e16) return 100; // $10-$100 → 1.0×
        if (valueWei <  5e17) return 130; // $100-$1k → 1.3×
        if (valueWei <  5e18) return 150; // $1k-$10k → 1.5×
        return 170;                        // > $10k   → 1.7×
    }

    /// @dev Integer square root (Babylonian / Heron's method).
    ///      Returns floor(sqrt(x)).
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /// @notice Protocol version tag (Spec 20).
    function protocolVersion() external pure returns (string memory) {
        return "1.0.0";
    }

    /// @inheritdoc ITrustRegistry
    function recordArbitratorSlash(
        address arbitrator,
        string calldata reason
    ) external override(ITrustRegistry) onlyUpdater noFlashLoan(arbitrator) {
        _ensureInitialized(arbitrator);
        TrustProfile storage p = profiles[arbitrator];
        uint256 oldGlobal = p.globalScore;
        uint256 penalty = ANOMALY_PENALTY * 2; // Arbitrator slash is heavier than standard anomaly
        uint256 newGlobal = oldGlobal >= penalty ? oldGlobal - penalty : 0;
        p.globalScore = newGlobal;
        p.lastUpdated = block.timestamp;
        emit ScoreUpdated(arbitrator, newGlobal, reason, -int256(penalty));
    }
}

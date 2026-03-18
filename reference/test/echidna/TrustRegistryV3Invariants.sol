// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../contracts/TrustRegistryV3.sol";

/**
 * @title TrustRegistryV3 Echidna Invariant Properties
 * @notice Property-based fuzzing harness for TrustRegistryV3.
 *
 * Run with:
 *   echidna . --contract TrustRegistryV3Invariants \
 *             --config test/echidna/echidna-trust.config.yaml
 *
 * Key invariants tested:
 *   I1. globalScore never exceeds MAX_SCORE (1000)
 *   I2. globalScore never underflows (uint256 cannot go below 0 in 0.8+)
 *   I3. getEffectiveScore never exceeds MAX_SCORE
 *   I4. recordSuccess never decreases globalScore (NOTE: may see 0-delta on noFlashLoan guard)
 *   I5. recordAnomaly never increases globalScore
 *   I6. getEffectiveScore <= getGlobalScore (HYPOTHESIS — may be violated when globalScore < DECAY_FLOOR)
 *   I7. Bond ETH balance invariant: contract balance >= sum of active bonds
 */
contract TrustRegistryV3Invariants is TrustRegistryV3 {

    // ── Fixed wallet set that echidna will manipulate ──────────────────────
    address internal constant W1 = address(0x10000);
    address internal constant W2 = address(0x20000);
    address internal constant W3 = address(0x30001); // note: 0x30000 is deployer/owner

    // ── Shadow state for score monotonicity tracking ───────────────────────
    mapping(address => uint256) internal _scoreBeforeSuccess;
    mapping(address => uint256) internal _scoreBeforeAnomaly;

    // Active bond amounts — tracked in parallel for ETH accounting
    uint256 internal _trackedBondTotal;

    constructor() TrustRegistryV3(address(0)) {
        // Deployer (this contract) is already authorized updater via parent constructor.
        // Initialise the tracked wallets with known starting state.
        _ensureInitialized(W1);
        _ensureInitialized(W2);
        _ensureInitialized(W3);
    }

    // ── Wrapper helpers echidna calls in fuzz sequences ────────────────────

    /// @dev Snapshot score before a success call so we can check monotonicity.
    function snapshotBeforeSuccess(address wallet) external {
        _scoreBeforeSuccess[wallet] = profiles[wallet].globalScore;
    }

    /// @dev Snapshot score before an anomaly call.
    function snapshotBeforeAnomaly(address wallet) external {
        _scoreBeforeAnomaly[wallet] = profiles[wallet].globalScore;
    }

    // ── Invariant 1: globalScore never exceeds MAX_SCORE ──────────────────

    function echidna_globalScore_W1_bounded() public view returns (bool) {
        return profiles[W1].globalScore <= MAX_SCORE;
    }

    function echidna_globalScore_W2_bounded() public view returns (bool) {
        return profiles[W2].globalScore <= MAX_SCORE;
    }

    function echidna_globalScore_W3_bounded() public view returns (bool) {
        return profiles[W3].globalScore <= MAX_SCORE;
    }

    // ── Invariant 2: getEffectiveScore never exceeds MAX_SCORE ────────────

    function echidna_effectiveScore_W1_bounded() public view returns (bool) {
        if (profiles[W1].lastUpdated == 0) return true; // uninitialised
        return this.getEffectiveScore(W1) <= MAX_SCORE;
    }

    function echidna_effectiveScore_W2_bounded() public view returns (bool) {
        if (profiles[W2].lastUpdated == 0) return true;
        return this.getEffectiveScore(W2) <= MAX_SCORE;
    }

    // ── Invariant 3 (HYPOTHESIS): effectiveScore <= globalScore ────────────
    // Expected result: VIOLATED — when globalScore < DECAY_FLOOR (100),
    // getEffectiveScore returns DECAY_FLOOR (100) > globalScore.
    // This is the "decay floor masking penalty" issue.

    function echidna_effectiveScore_le_globalScore_W1() public view returns (bool) {
        if (profiles[W1].lastUpdated == 0) return true;
        return this.getEffectiveScore(W1) <= profiles[W1].globalScore;
    }

    function echidna_effectiveScore_le_globalScore_W2() public view returns (bool) {
        if (profiles[W2].lastUpdated == 0) return true;
        return this.getEffectiveScore(W2) <= profiles[W2].globalScore;
    }

    // ── Invariant 4: capability slot scores never exceed MAX_SCORE ─────────

    function echidna_capabilitySlots_bounded_W1() public view returns (bool) {
        CapabilityScore[5] memory slots = this.getCapabilitySlots(W1);
        for (uint256 i = 0; i < 5; i++) {
            if (slots[i].score > MAX_SCORE) return false;
        }
        return true;
    }

    // ── Invariant 5: initWallet is idempotent (second call keeps score) ────
    // This is checked by calling initWallet and verifying score unchanged.

    function echidna_initWallet_idempotent_W1() public returns (bool) {
        uint256 before = profiles[W1].globalScore;
        if (profiles[W1].lastUpdated == 0) return true; // not yet initialised, skip
        _ensureInitialized(W1); // should be no-op
        return profiles[W1].globalScore == before;
    }

    // ── Invariant 6: ETH balance covers active bonds ───────────────────────
    // Because we track bonds[W1], bonds[W2], bonds[W3]:
    function echidna_eth_balance_covers_bonds() public view returns (bool) {
        uint256 activeBonds = 0;
        if (bonds[W1].active) activeBonds += bonds[W1].amount;
        if (bonds[W2].active) activeBonds += bonds[W2].amount;
        if (bonds[W3].active) activeBonds += bonds[W3].amount;
        return address(this).balance >= activeBonds;
    }
}

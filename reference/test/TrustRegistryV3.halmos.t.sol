// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/TrustRegistryV3.sol";

/**
 * @title TrustRegistryV3 Halmos Symbolic Tests
 * @notice Symbolic execution tests targeting specific invariants.
 *         Only uses assert() — no vm.expectRevert (not supported by halmos).
 *
 * Run: halmos --contract TrustRegistryV3HalmosTest --loop 3
 */
contract TrustRegistryV3HalmosTest is Test {

    TrustRegistryV3 registry;
    address constant WALLET = address(0xA1);
    address constant CP     = address(0xB1);
    uint256 constant REF    = 1e16;

    function setUp() public {
        registry = new TrustRegistryV3(address(0));
        registry.addUpdater(address(this));
        registry.initWallet(WALLET);
    }

    // ── Symbolic test 1: score never exceeds MAX_SCORE after any success ────

    /// @notice Halmos will symbolically enumerate all agreementValueWei to verify
    ///         globalScore never exceeds MAX_SCORE after recordSuccess.
    function check_recordSuccess_score_bounded(uint256 valueWei) public {
        // Bound to sane range to keep symbolic paths finite
        vm.assume(valueWei <= 1000 ether);
        vm.assume(valueWei >= REF);

        registry.recordSuccess(WALLET, CP, "compute", valueWei, block.timestamp);
        assert(registry.getGlobalScore(WALLET) <= registry.MAX_SCORE());
    }

    // ── Symbolic test 2: score cannot underflow via recordAnomaly ───────────

    /// @notice globalScore >= 0 always (uint256, but checks penalty logic).
    ///         Specifically verifies floor-at-zero holds for any starting score.
    function check_recordAnomaly_no_underflow(uint128 startBoost) public {
        // Apply arbitrary boost to reach some intermediate score
        vm.assume(startBoost > 0);
        vm.assume(startBoost <= 900);

        registry.applyBoost(WALLET, uint256(startBoost));
        uint256 before = registry.getGlobalScore(WALLET);

        vm.roll(block.number + 1);
        registry.recordAnomaly(WALLET, CP, "compute", REF);

        uint256 after_ = registry.getGlobalScore(WALLET);
        // Must not underflow: if penalty > score, result should be 0
        uint256 penalty = registry.ANOMALY_PENALTY();
        if (before >= penalty) {
            assert(after_ == before - penalty);
        } else {
            assert(after_ == 0);
        }
    }

    // ── Symbolic test 3: getEffectiveScore <= MAX_SCORE always ─────────────

    function check_effectiveScore_bounded_after_decay(uint32 warpSeconds) public {
        // Build up score
        registry.recordSuccess(WALLET, CP, "compute", 1 ether, block.timestamp);
        // Symbolic warp
        vm.warp(block.timestamp + uint256(warpSeconds));
        assert(registry.getEffectiveScore(WALLET) <= registry.MAX_SCORE());
    }

    // ── Symbolic test 4: effectiveScore CAN exceed globalScore (decay floor) ─

    /// @notice This test DOCUMENTS that effectiveScore >= DECAY_FLOOR always
    ///         (for initialized wallets), even when globalScore < DECAY_FLOOR.
    ///         This is the "floor masking" invariant — intentional design or bug?
    function check_effectiveScore_floor_masking(uint8 anomalyCount) public {
        vm.assume(anomalyCount > 0 && anomalyCount <= 4);

        for (uint256 i = 0; i < anomalyCount; i++) {
            vm.roll(block.number + 1 + i);
            registry.recordAnomaly(WALLET, CP, "compute", REF);
        }

        uint256 globalScore    = registry.getGlobalScore(WALLET);
        uint256 effectiveScore = registry.getEffectiveScore(WALLET);
        uint256 decayFloor     = registry.DECAY_FLOOR();

        // The floor masking: effectiveScore is always >= DECAY_FLOOR for initialized wallets
        assert(effectiveScore >= decayFloor);

        // Document the case: if globalScore < DECAY_FLOOR, effectiveScore > globalScore
        // This is a KNOWN design tension — penalties reduce globalScore below floor,
        // but getEffectiveScore floors at DECAY_FLOOR, masking the penalty for threshold checks.
        if (globalScore < decayFloor) {
            assert(effectiveScore > globalScore); // FLOOR MASKING CONFIRMED
        }
    }

    // ── Symbolic test 5: double-init cannot change score ───────────────────

    function check_initWallet_idempotent() public {
        uint256 before = registry.getGlobalScore(WALLET);
        registry.initWallet(WALLET); // second call — should be no-op
        assert(registry.getGlobalScore(WALLET) == before);
    }

    // ── Symbolic test 6: non-updater cannot record success ─────────────────
    // Note: halmos can verify this symbolically by checking the revert path.

    function check_onlyUpdater_enforced(address attacker) public {
        vm.assume(attacker != address(this));
        vm.assume(attacker != address(0));
        // Verify attacker is NOT an authorized updater
        vm.assume(!registry.isAuthorizedUpdater(attacker));

        vm.prank(attacker);
        try registry.recordSuccess(WALLET, CP, "compute", REF, block.timestamp) {
            // Should never reach here — if it does, access control is broken
            assert(false);
        } catch {
            // Expected revert — correct behavior
        }
    }

    // ── Symbolic test 7: bond ETH accounting ───────────────────────────────

    /// @notice Verify that withdrawSlashedBonds can drain active (unslashed) bond ETH.
    ///         This CONFIRMS the accounting bug found by Echidna.
    function check_withdrawSlashedBonds_can_drain_active_bonds() public {
        // Post an active bond
        vm.deal(address(this), 1 ether);
        registry.postBond{value: 0.1 ether}();

        // Verify bond is active and unslashed
        (, , bool active, bool slashed) = registry.bonds(address(this));
        assert(active);
        assert(!slashed);

        // Owner can withdraw any amount — including the active bond's ETH
        // This is the vulnerability: no accounting between slashed vs active ETH
        uint256 contractBalance = address(registry).balance;
        assert(contractBalance >= 0.1 ether);

        // A withdraw of 1 wei from a contract with only active-bond ETH succeeds
        // (confirmed by Echidna; documented here for symbolic tracing)
        registry.withdrawSlashedBonds(payable(address(0xBEEF)), 1);
        // If we reach here: confirmed — no slashed-only guard exists
        assert(true); // vulnerability confirmed: no separate slashed balance tracking
    }
}

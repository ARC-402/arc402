// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Mega Fuzzer — Invariant + property-based fuzz tests for ARC402Wallet ERC-4337.
 *
 * Coverage matrix
 * ───────────────────────────────────────────────────────────────────────────────
 *  FUZZ-INV-01  validateUserOp: only entryPoint caller is accepted — any other caller
 *               always reverts with WEp.
 *  FUZZ-INV-02a validateUserOp governance op + valid owner sig → always returns 0.
 *  FUZZ-INV-02b validateUserOp governance op + non-owner private key → always returns 1.
 *  FUZZ-INV-03  validateUserOp: return value is always in {0, 1} for any calldata + sig.
 *  FUZZ-INV-04a prefund > wallet balance always reverts WPrefund.
 *  FUZZ-INV-04b successful prefund reduces wallet balance by exactly prefund amount.
 *  FUZZ-INV-05  onlyEntryPointOrOwner functions: stranger always reverts WAuth.
 *  FUZZ-INV-06  governance op with empty/missing sig always returns SIG_VALIDATION_FAILED.
 *  FUZZ-INV-07  validateUserOp with random calldata never mutates wallet logical state.
 *  FUZZ-INV-08  random byte sequences as sig on governance ops: result always in {0,1},
 *               non-65-byte sigs always return SIG_VALIDATION_FAILED.
 *  FUZZ-INV-09  validateUserOp cannot drain more ETH than wallet holds.
 *  FUZZ-INV-10  frozen wallet always returns SIG_VALIDATION_FAILED for protocol ops.
 *
 * Stateful invariant tests (FuzzHandler driven):
 *  STAT-INV-01  validateUserOp never returns a value outside {0, 1}.
 *  STAT-INV-02  frozen wallet never lets any protocol op pass (ghost var check).
 * ───────────────────────────────────────────────────────────────────────────────
 */

import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ERC4337.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

// ─── Stateful invariant handler ───────────────────────────────────────────────
//
// The Foundry fuzzer drives random calls to the public functions below, then the
// invariant_ functions in ARC402WalletFuzzTest assert properties still hold.

contract FuzzHandler {
    // Access the Foundry VM cheatcodes from a non-Test contract.
    Vm private constant _vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    ARC402Wallet public wallet;
    address       public entryPoint;
    uint256       public ownerPrivKey;
    address       public owner;

    // ── Ghost variables (checked by invariant_ functions) ────────────────────
    bool public resultOutOfBounds;       // STAT-INV-01: any result ∉ {0, 1}
    bool public frozenProtocolOpPassed;  // STAT-INV-02: protocol op returned 0 while frozen

    constructor(
        ARC402Wallet _wallet,
        address _ep,
        uint256 _ownerKey,
        address _owner
    ) {
        wallet      = _wallet;
        entryPoint  = _ep;
        ownerPrivKey = _ownerKey;
        owner       = _owner;
    }

    // ── Handler: random calldata + random sig ─────────────────────────────────

    function h_validateRandom(
        bytes calldata cd,
        bytes calldata sig,
        bytes32 opHash
    ) external {
        PackedUserOperation memory op = _buildOp(cd, sig);
        _vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        _track(result);
    }

    // ── Handler: governance op with valid owner sig ───────────────────────────

    function h_validateGovernanceOwnerSig(uint8 govIdx, bytes32 opHash) external {
        bytes memory cd  = _govCalldata(govIdx % 9);
        bytes memory sig = _ownerSign(opHash);
        PackedUserOperation memory op = _buildOp(cd, sig);
        _vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        _track(result);
    }

    // ── Handler: protocol op while frozen ────────────────────────────────────

    function h_validateProtocolOpFrozen(bytes32 opHash) external {
        if (!wallet.frozen()) return;
        // openContext is a non-governance selector → pure protocol path
        bytes memory cd = abi.encodeWithSelector(
            wallet.openContext.selector, bytes32(0), "fuzz"
        );
        PackedUserOperation memory op = _buildOp(cd, "");
        _vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        if (result != 1) frozenProtocolOpPassed = true;
        _track(result);
    }

    // ── Handler: lifecycle helpers ────────────────────────────────────────────

    function h_freeze() external {
        if (wallet.frozen()) return;
        _vm.prank(owner);
        wallet.freeze("handler-fuzz-freeze");
    }

    function h_unfreeze() external {
        if (!wallet.frozen()) return;
        _vm.prank(owner);
        wallet.unfreeze();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _track(uint256 result) internal {
        if (result != 0 && result != 1) resultOutOfBounds = true;
    }

    function _buildOp(bytes memory cd, bytes memory sig)
        internal
        view
        returns (PackedUserOperation memory)
    {
        return PackedUserOperation({
            sender:            address(wallet),
            nonce:             0,
            initCode:          "",
            callData:          cd,
            accountGasLimits:  bytes32(uint256(100_000) << 128 | uint256(100_000)),
            preVerificationGas: 21_000,
            gasFees:           bytes32(uint256(1e9) << 128 | uint256(1e9)),
            paymasterAndData:  "",
            signature:         sig
        });
    }

    function _govCalldata(uint8 i) internal view returns (bytes memory) {
        if (i == 0) return abi.encodeWithSelector(wallet.setGuardian.selector, address(0x1234));
        if (i == 1) return abi.encodeWithSelector(wallet.updatePolicy.selector, bytes32(keccak256("p")));
        if (i == 2) return abi.encodeWithSelector(wallet.proposeRegistryUpdate.selector, address(0x5678));
        if (i == 3) return abi.encodeWithSelector(wallet.cancelRegistryUpdate.selector);
        if (i == 4) return abi.encodeWithSelector(wallet.executeRegistryUpdate.selector);
        if (i == 5) return abi.encodeWithSelector(wallet.setAuthorizedInterceptor.selector, address(0xABCD));
        if (i == 6) return abi.encodeWithSelector(wallet.setVelocityLimit.selector, uint256(1 ether));
        if (i == 7) return abi.encodeWithSignature("freeze(string)", "fuzz");
        /*i==8*/    return abi.encodeWithSelector(wallet.unfreeze.selector);
    }

    function _ownerSign(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
        (uint8 v, bytes32 r, bytes32 s) = _vm.sign(ownerPrivKey, ethHash);
        return abi.encodePacked(r, s, v);
    }
}

// ─── Main fuzz test contract ──────────────────────────────────────────────────

contract ARC402WalletFuzzTest is Test {

    PolicyEngine         policyEngine;
    TrustRegistry        trustRegistry;
    IntentAttestation    intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2     reg;
    ARC402Wallet         wallet;
    FuzzHandler          handler;

    uint256 ownerPrivateKey;
    address owner;
    address entryPoint;

    uint256 constant SIG_VALIDATION_SUCCESS = 0;
    uint256 constant SIG_VALIDATION_FAILED  = 1;

    // secp256k1 order alias (forge-std already declares SECP256K1_ORDER)
    uint256 constant CURVE_ORDER =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public {
        ownerPrivateKey = 0xA11CE;
        owner           = vm.addr(ownerPrivateKey);
        entryPoint      = address(0xE4337);

        policyEngine          = new PolicyEngine();
        trustRegistry         = new TrustRegistry();
        intentAttestation     = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinator();

        reg = new ARC402RegistryV2(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator),
            "v1.0.0"
        );

        vm.prank(owner);
        wallet = new ARC402Wallet(address(reg), owner, entryPoint);
        trustRegistry.addUpdater(address(wallet));
        vm.deal(address(wallet), 100 ether); // large buffer for prefund fuzzing

        handler = new FuzzHandler(wallet, entryPoint, ownerPrivateKey, owner);

        // Stateful invariant fuzzer targets FuzzHandler only.
        targetContract(address(handler));
    }

    // ── Internal helpers (mirrored in handler for correctness cross-check) ────

    function _buildOp(bytes memory cd, bytes memory sig)
        internal
        view
        returns (PackedUserOperation memory)
    {
        return PackedUserOperation({
            sender:            address(wallet),
            nonce:             0,
            initCode:          "",
            callData:          cd,
            accountGasLimits:  bytes32(uint256(100_000) << 128 | uint256(100_000)),
            preVerificationGas: 21_000,
            gasFees:           bytes32(uint256(1e9) << 128 | uint256(1e9)),
            paymasterAndData:  "",
            signature:         sig
        });
    }

    function _ownerSign(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _govCalldata(uint8 i) internal view returns (bytes memory) {
        uint8 idx = i % 9;
        if (idx == 0) return abi.encodeWithSelector(wallet.setGuardian.selector, address(0x1234));
        if (idx == 1) return abi.encodeWithSelector(wallet.updatePolicy.selector, bytes32(keccak256("p")));
        if (idx == 2) return abi.encodeWithSelector(wallet.proposeRegistryUpdate.selector, address(0x5678));
        if (idx == 3) return abi.encodeWithSelector(wallet.cancelRegistryUpdate.selector);
        if (idx == 4) return abi.encodeWithSelector(wallet.executeRegistryUpdate.selector);
        if (idx == 5) return abi.encodeWithSelector(wallet.setAuthorizedInterceptor.selector, address(0xABCD));
        if (idx == 6) return abi.encodeWithSelector(wallet.setVelocityLimit.selector, uint256(1 ether));
        if (idx == 7) return abi.encodeWithSignature("freeze(string)", "fuzz");
        /*idx==8*/    return abi.encodeWithSelector(wallet.unfreeze.selector);
    }

    /// @dev Returns true iff selector matches one of the 9 governance ops.
    function _isGovSelector(bytes4 sel) internal view returns (bool) {
        return sel == wallet.setGuardian.selector
            || sel == wallet.updatePolicy.selector
            || sel == wallet.proposeRegistryUpdate.selector
            || sel == wallet.cancelRegistryUpdate.selector
            || sel == wallet.executeRegistryUpdate.selector
            || sel == wallet.setAuthorizedInterceptor.selector
            || sel == wallet.setVelocityLimit.selector
            || sel == bytes4(keccak256("freeze(string)"))
            || sel == wallet.unfreeze.selector;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-01: Only entryPoint can call validateUserOp
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Any address other than entryPoint must get WEp revert.
    function testFuzz_inv01_nonEntryPoint_alwaysReverts(address caller) public {
        vm.assume(caller != entryPoint);
        PackedUserOperation memory op = _buildOp("", "");
        vm.prank(caller);
        vm.expectRevert(WEp.selector);
        wallet.validateUserOp(op, bytes32(0), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-02a: Governance op + valid owner sig → SIG_VALIDATION_SUCCESS (0)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice For all 9 governance selectors and any hash, a valid owner ECDSA
    ///         signature must cause validateUserOp to return 0.
    function testFuzz_inv02a_governanceOp_ownerSig_returnsSuccess(
        uint8   govIdx,
        bytes32 opHash
    ) public {
        bytes memory cd  = _govCalldata(govIdx);
        bytes memory sig = _ownerSign(opHash);
        PackedUserOperation memory op = _buildOp(cd, sig);

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS,
            "valid owner sig must return SIG_VALIDATION_SUCCESS");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-02b: Governance op + non-owner private key → SIG_VALIDATION_FAILED (1)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Signing with any key other than the owner must return 1.
    ///         We derive a valid ECDSA signature using a known-bad private key so the
    ///         test is deterministic and we can rule out false positives from malformed sigs.
    function testFuzz_inv02b_governanceOp_nonOwnerKey_returnsFailed(
        uint8   govIdx,
        bytes32 opHash,
        uint256 badPrivKey
    ) public {
        vm.assume(badPrivKey != ownerPrivateKey);
        vm.assume(badPrivKey != 0);
        vm.assume(badPrivKey < CURVE_ORDER);

        bytes memory cd = _govCalldata(govIdx);
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", opHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badPrivKey, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        PackedUserOperation memory op = _buildOp(cd, badSig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED,
            "non-owner key must return SIG_VALIDATION_FAILED");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-03: Return value is always 0 or 1 for any inputs
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice validateUserOp must return exactly 0 or 1 for all possible
    ///         calldata and signature combinations (no packed time-range values).
    function testFuzz_inv03_returnIsZeroOrOne(
        bytes calldata cd,
        bytes calldata sig,
        bytes32        opHash
    ) public {
        PackedUserOperation memory op = _buildOp(cd, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertLe(result, 1, "validateUserOp must return 0 or 1 - never any other value");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-04: Prefund invariants
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice prefund > wallet balance must always revert WPrefund.
    function testFuzz_inv04a_prefund_exceedsBalance_reverts(uint256 excess) public {
        vm.assume(excess > 0);
        vm.assume(excess <= type(uint128).max); // keep within sane range
        uint256 walletBal = address(wallet).balance;
        uint256 prefund   = walletBal + excess;

        bytes memory cd = abi.encodeWithSelector(
            wallet.openContext.selector, bytes32(0), "fuzz"
        );
        PackedUserOperation memory op = _buildOp(cd, "");

        vm.prank(entryPoint);
        vm.expectRevert(WPrefund.selector);
        wallet.validateUserOp(op, bytes32(0), prefund);
    }

    /// @notice Successful prefund (amount ≤ balance) reduces wallet balance by exactly prefund.
    function testFuzz_inv04b_prefund_reducesBalance(uint256 prefund) public {
        uint256 walletBal = address(wallet).balance;
        vm.assume(prefund > 0);
        vm.assume(prefund <= walletBal);

        bytes memory cd = abi.encodeWithSelector(
            wallet.openContext.selector, bytes32(0), "fuzz"
        );
        PackedUserOperation memory op = _buildOp(cd, "");

        vm.prank(entryPoint);
        wallet.validateUserOp(op, bytes32(0), prefund);

        assertEq(
            address(wallet).balance,
            walletBal - prefund,
            "wallet balance must decrease by exactly prefund"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-05: onlyEntryPointOrOwner functions reject any other caller
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Any address that is not entryPoint and not owner must receive WAuth
    ///         when calling any onlyEntryPointOrOwner function.
    function testFuzz_inv05_stranger_cannotCall_epOrOwner_functions(address stranger) public {
        vm.assume(stranger != entryPoint);
        vm.assume(stranger != owner);
        vm.assume(stranger != address(0));

        // setGuardian
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.setGuardian(address(0x1));

        // updatePolicy
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.updatePolicy(bytes32(0));

        // setVelocityLimit
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.setVelocityLimit(1 ether);

        // openContext
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.openContext(bytes32(0), "fuzz");

        // setAuthorizedInterceptor
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.setAuthorizedInterceptor(address(0x2));

        // proposeRegistryUpdate
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.proposeRegistryUpdate(address(0x3));

        // executeContractCall
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.executeContractCall(ARC402Wallet.ContractCallParams({
            target:            address(0x4),
            data:              "",
            value:             0,
            minReturnValue:    0,
            maxApprovalAmount: 0,
            approvalToken:     address(0)
        }));

        // attest
        vm.prank(stranger); vm.expectRevert(WAuth.selector);
        wallet.attest(bytes32(0), "a", "r", address(0x5), 0, address(0), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-06: Machine key + EntryPoint cannot call governance without owner sig
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A governance UserOp with an empty signature must always return
    ///         SIG_VALIDATION_FAILED regardless of who submitted it.
    ///         This models the scenario where a machine key controls the EntryPoint
    ///         submission but does not have the owner's master key material.
    function testFuzz_inv06_governanceOp_emptySig_returnsFailed(
        uint8   govIdx,
        bytes32 opHash
    ) public {
        bytes memory cd = _govCalldata(govIdx);
        PackedUserOperation memory op = _buildOp(cd, ""); // empty sig

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED,
            "governance op with empty sig must return SIG_VALIDATION_FAILED");
    }

    /// @notice Governance op with a signature that is exactly 65 bytes but for a
    ///         non-owner key must still return SIG_VALIDATION_FAILED.
    function testFuzz_inv06b_governanceOp_machineKeySig_returnsFailed(
        uint8   govIdx,
        bytes32 opHash,
        uint256 machineKey
    ) public {
        // Machine key ≠ owner key, non-zero, in valid secp256k1 range
        vm.assume(machineKey != ownerPrivateKey);
        vm.assume(machineKey != 0);
        vm.assume(machineKey < CURVE_ORDER);

        bytes memory cd = _govCalldata(govIdx);
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", opHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(machineKey, ethHash);
        bytes memory machineSig = abi.encodePacked(r, s, v);

        PackedUserOperation memory op = _buildOp(cd, machineSig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED,
            "machine key sig must not pass governance op");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-07: Random calldata never mutates wallet logical state
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice validateUserOp is a view-like validation function.
    ///         It must not change any wallet governance/policy state — only the ETH
    ///         balance is allowed to change (the prefund transfer).  We fix prefund=0
    ///         so even balance is unchanged.
    function testFuzz_inv07_randomCalldata_preservesState(
        bytes calldata cd,
        bytes calldata sig,
        bytes32        opHash
    ) public {
        // Snapshot all mutable logical state
        bool    frozenBefore        = wallet.frozen();
        bytes32 policyBefore        = wallet.activePolicyId();
        bytes32 contextIdBefore     = wallet.activeContextId();
        bool    contextOpenBefore   = wallet.contextOpen();
        uint256 velocityBefore      = wallet.velocityLimit();
        address guardianBefore      = wallet.guardian();
        address interceptorBefore   = wallet.authorizedInterceptor();
        address pendingRegBefore    = wallet.pendingRegistry();
        uint256 balanceBefore       = address(wallet).balance;

        PackedUserOperation memory op = _buildOp(cd, sig);
        vm.prank(entryPoint);
        // prefund=0 → no ETH movement; function must return 0 or 1 without reverting
        wallet.validateUserOp(op, opHash, 0);

        // Assert all state is unchanged
        assertEq(wallet.frozen(),               frozenBefore,      "frozen must not change");
        assertEq(wallet.activePolicyId(),        policyBefore,      "policyId must not change");
        assertEq(wallet.activeContextId(),       contextIdBefore,   "contextId must not change");
        assertEq(wallet.contextOpen(),           contextOpenBefore, "contextOpen must not change");
        assertEq(wallet.velocityLimit(),         velocityBefore,    "velocityLimit must not change");
        assertEq(wallet.guardian(),              guardianBefore,    "guardian must not change");
        assertEq(wallet.authorizedInterceptor(), interceptorBefore, "interceptor must not change");
        assertEq(wallet.pendingRegistry(),       pendingRegBefore,  "pendingRegistry must not change");
        assertEq(address(wallet).balance,        balanceBefore,     "ETH balance must not change (prefund=0)");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-08: Random byte sequences as signatures on governance ops
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Arbitrary raw bytes as signature must never cause a revert or return
    ///         a value outside {0, 1}.  Additionally, signatures with length ≠ 65
    ///         (not a valid compact ECDSA signature) must always return FAILED.
    function testFuzz_inv08_randomBytesSig_governance_zeroOrOne(
        uint8          govIdx,
        bytes32        opHash,
        bytes calldata randomSig
    ) public {
        bytes memory cd = _govCalldata(govIdx);
        PackedUserOperation memory op = _buildOp(cd, randomSig);

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertLe(result, 1, "result must be 0 or 1 for any random sig bytes");

        // Non-65-byte inputs cannot be valid ECDSA compact sigs → must return FAILED
        if (randomSig.length != 65) {
            assertEq(result, SIG_VALIDATION_FAILED,
                "non-65-byte sig must return SIG_VALIDATION_FAILED");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-09: validateUserOp cannot drain more ETH than wallet holds
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice For any prefund amount:
    ///   • If prefund ≤ balance: call succeeds and balance decreases by exactly prefund.
    ///   • If prefund > balance: call reverts WPrefund and balance is unchanged.
    function testFuzz_inv09_prefund_bounded_byBalance(uint256 prefund) public {
        uint256 balBefore = address(wallet).balance;
        bytes memory cd = abi.encodeWithSelector(
            wallet.openContext.selector, bytes32(0), "fuzz"
        );
        PackedUserOperation memory op = _buildOp(cd, "");

        vm.prank(entryPoint);
        try wallet.validateUserOp(op, bytes32(0), prefund) {
            // Success path: balance must have decreased by exactly prefund
            assertEq(address(wallet).balance, balBefore - prefund,
                "balance must decrease by exactly prefund on success");
        } catch {
            // Failure path: balance must be unchanged
            assertEq(address(wallet).balance, balBefore,
                "balance must be unchanged when validateUserOp reverts");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ-INV-10: Frozen wallet always fails validateUserOp for protocol ops
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice When frozen=true, any non-governance calldata must return
    ///         SIG_VALIDATION_FAILED.  Governance ops bypass the frozen check
    ///         deliberately (owner must be able to unfreeze via UserOp).
    function testFuzz_inv10_frozenWallet_protocolOpFails(bytes calldata cd) public {
        // Freeze the wallet
        vm.prank(owner);
        wallet.freeze("fuzz-inv10");
        assertTrue(wallet.frozen(), "wallet should be frozen");

        // Exclude governance selectors — they legitimately bypass frozen for sig checks
        bytes4 sel = cd.length >= 4 ? bytes4(cd[:4]) : bytes4(0);
        vm.assume(!_isGovSelector(sel));

        PackedUserOperation memory op = _buildOp(cd, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, bytes32(0), 0);
        assertEq(result, SIG_VALIDATION_FAILED,
            "frozen wallet must return SIG_VALIDATION_FAILED for protocol ops");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Stateful invariant tests — driven by FuzzHandler
    // ═══════════════════════════════════════════════════════════════════════════

    /// @custom:invariant STAT-INV-01
    /// After any sequence of handler calls, validateUserOp must never have returned
    /// a value outside {0, 1}.
    function invariant_resultIsZeroOrOne() public view {
        assertFalse(
            handler.resultOutOfBounds(),
            "STAT-INV-01: validateUserOp returned a value outside {0, 1}"
        );
    }

    /// @custom:invariant STAT-INV-02
    /// After any sequence of handler calls, no protocol UserOp must have been
    /// approved (returned 0) while the wallet was in the frozen state.
    function invariant_frozenWallet_protocolOpBlocked() public view {
        assertFalse(
            handler.frozenProtocolOpPassed(),
            "STAT-INV-02: frozen wallet allowed a protocol op to pass"
        );
    }
}

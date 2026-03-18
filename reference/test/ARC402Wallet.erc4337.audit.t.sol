// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Audit regression tests — ERC-4337 findings AUDIT-ERC4337-2026-03-16
 *
 * AUD-4337-01 (Critical): Governance functions used onlyOwner, blocking EntryPoint execution.
 *   Fix: Changed to onlyEntryPointOrOwner. These tests confirm governance UserOps now
 *   both validate AND execute successfully.
 *
 * AUD-4337-02 (High): cancelRegistryUpdate, executeRegistryUpdate, setAuthorizedInterceptor
 *   absent from _isGovernanceOp. Fix: Added all three. These tests confirm they now require
 *   owner signature and execute via EntryPoint.
 */
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ERC4337.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

contract ARC402WalletERC4337AuditTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;

    uint256 ownerPrivateKey;
    address owner;
    address entryPoint;
    address stranger = address(0xBB02);

    uint256 constant SIG_VALIDATION_SUCCESS = 0;
    uint256 constant SIG_VALIDATION_FAILED  = 1;

    function setUp() public {
        ownerPrivateKey = 0xA11CE;
        owner = vm.addr(ownerPrivateKey);
        entryPoint = address(0xE4337);

        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();
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
        vm.deal(address(wallet), 10 ether);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _buildUserOp(bytes memory callData, bytes memory signature)
        internal
        view
        returns (PackedUserOperation memory)
    {
        return PackedUserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(uint256(100000) << 128 | uint256(100000)),
            preVerificationGas: 21000,
            gasFees: bytes32(uint256(1e9) << 128 | uint256(1e9)),
            paymasterAndData: "",
            signature: signature
        });
    }

    function _ownerSign(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // ─── AUD-4337-01: Governance functions execute via EntryPoint ─────────────
    //
    // Pre-fix: onlyOwner blocked EntryPoint — these would revert WAuth().
    // Post-fix: onlyEntryPointOrOwner allows EntryPoint after signature validated.

    function test_AUD4337_01_setGuardian_executesViaEntryPoint() public {
        address newGuardian = address(0x9999);
        bytes memory callData = abi.encodeWithSignature("setGuardian(address)", newGuardian);
        bytes32 userOpHash = keccak256("setGuardian-hash");
        bytes memory sig = _ownerSign(userOpHash);

        // Validate
        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS, "validation must pass");

        // Execute (EntryPoint calls the function after validation)
        vm.prank(entryPoint);
        wallet.setGuardian(newGuardian);
        assertEq(wallet.guardian(), newGuardian, "guardian must be updated");
    }

    function test_AUD4337_01_updatePolicy_executesViaEntryPoint() public {
        bytes32 newPolicyId = keccak256("new-policy");
        bytes memory callData = abi.encodeWithSignature("updatePolicy(bytes32)", newPolicyId);
        bytes32 userOpHash = keccak256("updatePolicy-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.updatePolicy(newPolicyId);
        assertEq(wallet.activePolicyId(), newPolicyId, "policy must be updated");
    }

    function test_AUD4337_01_setVelocityLimit_executesViaEntryPoint() public {
        uint256 newLimit = 5 ether;
        bytes memory callData = abi.encodeWithSignature("setVelocityLimit(uint256)", newLimit);
        bytes32 userOpHash = keccak256("setVelocityLimit-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.setVelocityLimit(newLimit);
        assertEq(wallet.velocityLimit(), newLimit, "velocity limit must be updated");
    }

    function test_AUD4337_01_proposeRegistryUpdate_executesViaEntryPoint() public {
        address newReg = address(0x5678);
        bytes memory callData = abi.encodeWithSignature("proposeRegistryUpdate(address)", newReg);
        bytes32 userOpHash = keccak256("proposeRegistry-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.proposeRegistryUpdate(newReg);
        assertEq(wallet.pendingRegistry(), newReg, "pending registry must be set");
    }

    function test_AUD4337_01_freeze_executesViaEntryPoint() public {
        bytes memory callData = abi.encodeWithSignature("freeze(string)", "ep-freeze");
        bytes32 userOpHash = keccak256("freeze-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.freeze("ep-freeze");
        assertTrue(wallet.frozen(), "wallet must be frozen");
    }

    function test_AUD4337_01_unfreeze_executesViaEntryPoint() public {
        // Freeze first via owner
        vm.prank(owner);
        wallet.freeze("test");
        assertTrue(wallet.frozen());

        bytes memory callData = abi.encodeWithSignature("unfreeze()");
        bytes32 userOpHash = keccak256("unfreeze-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.unfreeze();
        assertFalse(wallet.frozen(), "wallet must be unfrozen");
    }

    // Pre-fix: governance UserOps with INVALID sig must still fail validation (regression)
    function test_AUD4337_01_governance_badSig_stillFails() public {
        bytes memory callData = abi.encodeWithSignature("setGuardian(address)", address(0xDEAD));
        bytes32 userOpHash = keccak256("setGuardian-hash");
        // Sign with wrong key
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBADBAD, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        PackedUserOperation memory userOp = _buildUserOp(callData, badSig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED, "bad sig must fail");
    }

    // ─── AUD-4337-02: Missing functions added to _isGovernanceOp ─────────────
    //
    // Pre-fix: these were protocol ops — auto-approved without owner sig.
    // Post-fix: they are governance ops — require owner sig.

    function test_AUD4337_02_cancelRegistryUpdate_requiresOwnerSig() public {
        // First propose a registry update (as owner directly)
        vm.prank(owner);
        wallet.proposeRegistryUpdate(address(0x5678));

        // Try to cancel via UserOp WITHOUT owner signature — must fail validation
        bytes memory callData = abi.encodeWithSignature("cancelRegistryUpdate()");
        bytes32 userOpHash = keccak256("cancel-hash");
        // No signature (empty)
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED, "cancelRegistryUpdate must require owner sig");
    }

    function test_AUD4337_02_cancelRegistryUpdate_executesViaEntryPoint_withSig() public {
        vm.prank(owner);
        wallet.proposeRegistryUpdate(address(0x5678));

        bytes memory callData = abi.encodeWithSignature("cancelRegistryUpdate()");
        bytes32 userOpHash = keccak256("cancel-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.cancelRegistryUpdate();
        assertEq(wallet.pendingRegistry(), address(0), "pending registry must be cleared");
    }

    function test_AUD4337_02_executeRegistryUpdate_requiresOwnerSig() public {
        // Try to execute registry update via UserOp WITHOUT owner signature
        bytes memory callData = abi.encodeWithSignature("executeRegistryUpdate()");
        bytes32 userOpHash = keccak256("exec-reg-hash");
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED, "executeRegistryUpdate must require owner sig");
    }

    function test_AUD4337_02_setAuthorizedInterceptor_requiresOwnerSig() public {
        // Try to set interceptor via UserOp WITHOUT owner signature — must fail validation
        bytes memory callData = abi.encodeWithSignature(
            "setAuthorizedInterceptor(address)", address(0xBEEF)
        );
        bytes32 userOpHash = keccak256("interceptor-hash");
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED, "setAuthorizedInterceptor must require owner sig");
    }

    function test_AUD4337_02_setAuthorizedInterceptor_executesViaEntryPoint_withSig() public {
        address interceptor = address(0xBEEF);
        bytes memory callData = abi.encodeWithSignature(
            "setAuthorizedInterceptor(address)", interceptor
        );
        bytes32 userOpHash = keccak256("interceptor-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);

        vm.prank(entryPoint);
        wallet.setAuthorizedInterceptor(interceptor);
        assertEq(wallet.authorizedInterceptor(), interceptor, "interceptor must be set");
    }
}

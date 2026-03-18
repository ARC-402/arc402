// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice ERC-4337 validateUserOp tests for ARC402Wallet.
 *
 * Tests cover:
 *   - Only EntryPoint can call validateUserOp
 *   - Governance ops require valid owner signature (SIG_VALIDATION_SUCCESS)
 *   - Governance ops with bad signature return SIG_VALIDATION_FAILED
 *   - Protocol ops auto-approve (return 0) when wallet is not frozen
 *   - Protocol ops return SIG_VALIDATION_FAILED when wallet is frozen
 *   - Empty calldata auto-approves (ETH transfer path)
 *   - missingAccountFunds prefund is forwarded to EntryPoint
 */
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ERC4337.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

contract ARC402WalletERC4337Test is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;

    // Use vm.createWallet to get a real signing key for owner
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

        // Deploy wallet with owner (not address(this)) so we can test signature validation
        vm.prank(owner);
        wallet = new ARC402Wallet(address(reg), owner, entryPoint);
        trustRegistry.addUpdater(address(wallet));
        vm.deal(address(wallet), 10 ether);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Build a minimal PackedUserOperation for testing.
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

    /// @dev Sign a hash with the owner private key (EIP-191 eth_sign format).
    function _ownerSign(bytes32 hash) internal view returns (bytes memory) {
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // ─── Only EntryPoint may call validateUserOp ──────────────────────────────

    function test_validateUserOp_rejectsNonEntryPoint() public {
        PackedUserOperation memory userOp = _buildUserOp("", "");
        vm.prank(stranger);
        vm.expectRevert(WEp.selector);
        wallet.validateUserOp(userOp, bytes32(0), 0);
    }

    function test_validateUserOp_rejectsOwnerCalling() public {
        PackedUserOperation memory userOp = _buildUserOp("", "");
        vm.prank(owner);
        vm.expectRevert(WEp.selector);
        wallet.validateUserOp(userOp, bytes32(0), 0);
    }

    // ─── Protocol ops: auto-approve ──────────────────────────────────────────

    function test_validateUserOp_protocolOp_openContext_approves() public {
        bytes memory callData = abi.encodeWithSignature(
            "openContext(bytes32,string)", keccak256("ctx"), "task"
        );
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        bytes32 userOpHash = keccak256("test-hash-open-context");

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_protocolOp_closeContext_approves() public {
        bytes memory callData = abi.encodeWithSignature("closeContext()");
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_executeContractCall_requiresOwnerSig() public {
        // CRITICAL-1 fix: executeContractCall is now in _isGovernanceOp — requires owner sig.
        bytes memory callData = abi.encodeWithSignature(
            "executeContractCall((address,bytes,uint256,uint256,uint256,address))",
            address(0), "", uint256(0), uint256(0), uint256(0), address(0)
        );
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    function test_validateUserOp_protocolOp_attest_approves() public {
        bytes memory callData = abi.encodeWithSignature(
            "attest(bytes32,string,string,address,uint256,address,uint256)",
            bytes32(0), "action", "reason", address(0), uint256(0), address(0), uint256(0)
        );
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_emptyCalldata_approves() public {
        PackedUserOperation memory userOp = _buildUserOp("", "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_shortCalldata_approves() public {
        PackedUserOperation memory userOp = _buildUserOp(hex"aabbcc", ""); // 3 bytes
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    // ─── Protocol ops: frozen wallet rejects ─────────────────────────────────

    function test_validateUserOp_protocolOp_frozenWallet_fails() public {
        vm.prank(owner);
        wallet.freeze("security incident");

        bytes memory callData = abi.encodeWithSignature(
            "openContext(bytes32,string)", keccak256("ctx"), "task"
        );
        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("test-hash"), 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    // ─── Governance ops: require valid owner signature ────────────────────────

    function test_validateUserOp_governanceOp_setGuardian_validSig_succeeds() public {
        bytes memory callData = abi.encodeWithSignature("setGuardian(address)", address(0xABCD));
        bytes32 userOpHash = keccak256("setGuardian-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_setGuardian_invalidSig_fails() public {
        bytes memory callData = abi.encodeWithSignature("setGuardian(address)", address(0xABCD));
        bytes32 userOpHash = keccak256("setGuardian-hash");
        // Sign with wrong key
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBADBAD, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        PackedUserOperation memory userOp = _buildUserOp(callData, badSig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    function test_validateUserOp_governanceOp_updatePolicy_validSig_succeeds() public {
        bytes memory callData = abi.encodeWithSignature("updatePolicy(bytes32)", keccak256("policy"));
        bytes32 userOpHash = keccak256("updatePolicy-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_setVelocityLimit_validSig_succeeds() public {
        bytes memory callData = abi.encodeWithSignature("setVelocityLimit(uint256)", 1 ether);
        bytes32 userOpHash = keccak256("setVelocityLimit-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_freeze_validSig_succeeds() public {
        bytes memory callData = abi.encodeWithSignature("freeze(string)", "emergency");
        bytes32 userOpHash = keccak256("freeze-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_unfreeze_validSig_succeeds() public {
        // Freeze first
        vm.prank(owner);
        wallet.freeze("test");

        bytes memory callData = abi.encodeWithSignature("unfreeze()");
        bytes32 userOpHash = keccak256("unfreeze-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_proposeRegistryUpdate_validSig_succeeds() public {
        bytes memory callData = abi.encodeWithSignature(
            "proposeRegistryUpdate(address)", address(0x1234)
        );
        bytes32 userOpHash = keccak256("proposeRegistry-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    function test_validateUserOp_governanceOp_emptySig_fails() public {
        bytes memory callData = abi.encodeWithSignature("setGuardian(address)", address(0xABCD));
        bytes32 userOpHash = keccak256("setGuardian-hash");

        PackedUserOperation memory userOp = _buildUserOp(callData, "");
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    // ─── missingAccountFunds prefund ─────────────────────────────────────────

    function test_validateUserOp_prefundsEntryPoint() public {
        uint256 prefund = 0.1 ether;
        uint256 epBalanceBefore = address(entryPoint).balance;

        bytes memory callData = abi.encodeWithSignature(
            "openContext(bytes32,string)", keccak256("ctx"), "task"
        );
        PackedUserOperation memory userOp = _buildUserOp(callData, "");

        vm.prank(entryPoint);
        wallet.validateUserOp(userOp, keccak256("test-hash"), prefund);

        assertEq(address(entryPoint).balance - epBalanceBefore, prefund);
        // Wallet ETH reduced by prefund
    }

    function test_validateUserOp_zeroPrefund_noTransfer() public {
        uint256 epBalanceBefore = address(entryPoint).balance;
        bytes memory callData = abi.encodeWithSignature("closeContext()");
        PackedUserOperation memory userOp = _buildUserOp(callData, "");

        vm.prank(entryPoint);
        wallet.validateUserOp(userOp, keccak256("test-hash"), 0);

        assertEq(address(entryPoint).balance, epBalanceBefore);
    }

    // ─── Governance op with frozen wallet: still validates signature ──────────
    //
    // Governance ops bypass the frozen check — they check signature not policy bounds.
    // This allows the owner to unfreeze via a governance user op.

    function test_validateUserOp_unfreeze_validSig_succeeds_whileFrozen() public {
        vm.prank(owner);
        wallet.freeze("test");
        assertTrue(wallet.frozen());

        bytes memory callData = abi.encodeWithSignature("unfreeze()");
        bytes32 userOpHash = keccak256("unfreeze-hash");
        bytes memory sig = _ownerSign(userOpHash);

        PackedUserOperation memory userOp = _buildUserOp(callData, sig);
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, userOpHash, 0);
        // Governance ops are not blocked by frozen — owner can always unfreeze via user op
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }
}

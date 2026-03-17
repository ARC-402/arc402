// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Spec-33 passkey tests for ARC402Wallet.
 *
 * Tests cover:
 *   - ownerAuth initialises to EOA mode with owner address in pubKeyX
 *   - setPasskey stores Passkey signerType + coordinates, emits PasskeySet
 *   - clearPasskey reverts to EOA mode
 *   - setPasskey rejects zero-zero key (WZero)
 *   - setPasskey and clearPasskey are governance ops (require owner sig in validateUserOp)
 *   - validateUserOp routes to P256 path when Passkey mode (degrades safely — no precompile in local EVM)
 *   - emergencyOwnerOverride(x, y) directly from EOA rotates passkey without EntryPoint
 *   - emergencyOwnerOverride() directly from EOA reverts to EOA mode
 *   - emergencyOwnerOverride reverts if called by non-owner
 */
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ERC4337.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

contract ARC402WalletPasskeyTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;

    uint256 ownerPrivateKey;
    address owner;
    address entryPoint;
    address stranger;

    uint256 constant SIG_VALIDATION_SUCCESS = 0;
    uint256 constant SIG_VALIDATION_FAILED  = 1;

    bytes32 constant SAMPLE_X = bytes32(uint256(0xdeadbeefcafe1234deadbeefcafe1234deadbeefcafe1234deadbeefcafe1234));
    bytes32 constant SAMPLE_Y = bytes32(uint256(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890));

    function setUp() public {
        ownerPrivateKey = 0xA11CE;
        owner     = vm.addr(ownerPrivateKey);
        entryPoint = address(0xE4337);
        stranger   = address(0xBAD);

        policyEngine       = new PolicyEngine();
        trustRegistry      = new TrustRegistry();
        intentAttestation  = new IntentAttestation();
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
        vm.deal(address(wallet), 1 ether);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    function _signGovOp(bytes4 selector, bytes memory args) internal view returns (PackedUserOperation memory, bytes32) {
        bytes memory callData = abi.encodePacked(selector, args);
        PackedUserOperation memory op;
        op.sender = address(wallet);
        op.nonce  = 0;
        op.callData = callData;
        op.accountGasLimits = bytes32(uint256(1_000_000) << 128 | uint256(1_000_000));
        op.preVerificationGas = 50_000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));

        bytes32 userOpHash = keccak256(abi.encode(op, entryPoint, block.chainid));
        bytes32 ethHash    = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, ethHash);
        op.signature = abi.encodePacked(r, s, v);
        return (op, userOpHash);
    }

    // ─── Initial State ────────────────────────────────────────────────────────

    function test_Passkey_InitialState_IsEOA() public view {
        (ARC402Wallet.SignerType signerType, bytes32 pubKeyX, bytes32 pubKeyY) = wallet.ownerAuth();
        assertEq(uint8(signerType), uint8(ARC402Wallet.SignerType.EOA));
        assertEq(pubKeyX, bytes32(uint256(uint160(owner))));
        assertEq(pubKeyY, bytes32(0));
    }

    // ─── setPasskey ───────────────────────────────────────────────────────────

    function test_Passkey_SetPasskey_SetsState() public {
        vm.expectEmit(true, false, false, true);
        emit ARC402Wallet.PasskeySet(SAMPLE_X, SAMPLE_Y);

        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        (ARC402Wallet.SignerType signerType, bytes32 pubKeyX, bytes32 pubKeyY) = wallet.ownerAuth();
        assertEq(uint8(signerType), uint8(ARC402Wallet.SignerType.Passkey));
        assertEq(pubKeyX, SAMPLE_X);
        assertEq(pubKeyY, SAMPLE_Y);
    }

    function test_Passkey_SetPasskey_RejectsZeroKey() public {
        vm.expectRevert(WZero.selector);
        vm.prank(owner);
        wallet.setPasskey(bytes32(0), bytes32(0));
    }

    function test_Passkey_SetPasskey_RejectsStranger() public {
        vm.expectRevert(WAuth.selector);
        vm.prank(stranger);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);
    }

    function test_Passkey_SetPasskey_IsGovernanceOp() public {
        // validateUserOp should accept setPasskey with valid owner sig
        (PackedUserOperation memory op, bytes32 opHash) = _signGovOp(
            wallet.setPasskey.selector,
            abi.encode(SAMPLE_X, SAMPLE_Y)
        );
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    // ─── clearPasskey ─────────────────────────────────────────────────────────

    function test_Passkey_ClearPasskey_RevertsToEOA() public {
        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        vm.prank(owner);
        wallet.clearPasskey();

        (ARC402Wallet.SignerType signerType, bytes32 pubKeyX, bytes32 pubKeyY) = wallet.ownerAuth();
        assertEq(uint8(signerType), uint8(ARC402Wallet.SignerType.EOA));
        assertEq(pubKeyX, bytes32(uint256(uint160(owner))));
        assertEq(pubKeyY, bytes32(0));
    }

    function test_Passkey_ClearPasskey_IsGovernanceOp() public {
        (PackedUserOperation memory op, bytes32 opHash) = _signGovOp(
            wallet.clearPasskey.selector,
            ""
        );
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS);
    }

    // ─── P256 routing in validateUserOp ──────────────────────────────────────

    function test_Passkey_ValidateUserOp_P256Route_DegradesSafelyWithoutPrecompile() public {
        // Switch to Passkey mode
        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        // Build a governance op targeting setGuardian (a governance op)
        PackedUserOperation memory op;
        op.sender    = address(wallet);
        op.nonce     = 0;
        op.callData  = abi.encodeWithSelector(wallet.setGuardian.selector, address(0x1234));
        op.accountGasLimits   = bytes32(uint256(1_000_000) << 128 | uint256(1_000_000));
        op.preVerificationGas = 50_000;
        op.gasFees   = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));
        op.signature = new bytes(64); // 64-byte zero sig (invalid but correct length)

        bytes32 opHash = keccak256(abi.encode(op, entryPoint, block.chainid));

        // The P256 precompile doesn't exist in local Foundry EVM — staticcall fails → SIG_VALIDATION_FAILED
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    function test_Passkey_ValidateUserOp_P256Route_RejectsWrongSigLength() public {
        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        PackedUserOperation memory op;
        op.sender    = address(wallet);
        op.nonce     = 0;
        op.callData  = abi.encodeWithSelector(wallet.setGuardian.selector, address(0x1234));
        op.accountGasLimits   = bytes32(uint256(1_000_000) << 128 | uint256(1_000_000));
        op.preVerificationGas = 50_000;
        op.gasFees   = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));
        op.signature = new bytes(65); // wrong length — must be exactly 64

        bytes32 opHash = keccak256(abi.encode(op, entryPoint, block.chainid));

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_FAILED);
    }

    // ─── emergencyOwnerOverride ───────────────────────────────────────────────

    function test_Passkey_EmergencyOverride_RotatesToNewPasskey() public {
        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        bytes32 newX = bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111));
        bytes32 newY = bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222));

        vm.expectEmit(true, false, false, true);
        emit ARC402Wallet.PasskeySet(newX, newY);

        vm.prank(owner);
        wallet.emergencyOwnerOverride(newX, newY);

        (ARC402Wallet.SignerType signerType, bytes32 pubKeyX, bytes32 pubKeyY) = wallet.ownerAuth();
        assertEq(uint8(signerType), uint8(ARC402Wallet.SignerType.Passkey));
        assertEq(pubKeyX, newX);
        assertEq(pubKeyY, newY);
    }

    function test_Passkey_EmergencyOverride_NoArg_RevertsToEOA() public {
        vm.prank(owner);
        wallet.setPasskey(SAMPLE_X, SAMPLE_Y);

        // Call the no-arg overload (reverts to EOA mode)
        // Solidity doesn't allow ambiguous overload resolution via prank, use low-level call
        bytes memory data = abi.encodeWithSignature("emergencyOwnerOverride()");
        vm.prank(owner);
        (bool ok,) = address(wallet).call(data);
        assertTrue(ok);

        (ARC402Wallet.SignerType signerType,,) = wallet.ownerAuth();
        assertEq(uint8(signerType), uint8(ARC402Wallet.SignerType.EOA));
    }

    function test_Passkey_EmergencyOverride_RejectsStranger() public {
        vm.expectRevert(WAuth.selector);
        vm.prank(stranger);
        wallet.emergencyOwnerOverride(SAMPLE_X, SAMPLE_Y);
    }

    function test_Passkey_EmergencyOverride_RejectsZeroKey() public {
        vm.expectRevert(WZero.selector);
        vm.prank(owner);
        wallet.emergencyOwnerOverride(bytes32(0), bytes32(0));
    }

    function test_Passkey_EmergencyOverride_RejectsViaEntryPoint() public {
        // emergencyOwnerOverride is NOT callable via EntryPoint — direct EOA only
        bytes memory data = abi.encodeWithSignature("emergencyOwnerOverride(bytes32,bytes32)", SAMPLE_X, SAMPLE_Y);
        PackedUserOperation memory op;
        op.sender    = address(wallet);
        op.nonce     = 0;
        op.callData  = data;
        op.accountGasLimits   = bytes32(uint256(1_000_000) << 128 | uint256(1_000_000));
        op.preVerificationGas = 50_000;
        op.gasFees   = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));

        bytes32 opHash = keccak256(abi.encode(op, entryPoint, block.chainid));
        // Not a governance op → auto-approves in validateUserOp
        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(op, opHash, 0);
        assertEq(result, SIG_VALIDATION_SUCCESS); // validates OK ...

        // ... but execution reverts because msg.sender == entryPoint ≠ owner
        vm.expectRevert(WAuth.selector);
        vm.prank(entryPoint);
        wallet.emergencyOwnerOverride(SAMPLE_X, SAMPLE_Y);
    }
}

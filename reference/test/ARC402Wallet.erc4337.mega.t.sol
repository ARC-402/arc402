// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Mega Architect Audit regression tests — AUDIT-MEGA-ARCHITECT-2026-03-16
 *
 * ARCH-01 (High): executeTokenSpend used onlyOwnerOrInterceptor — blocked EntryPoint.
 *   Fix: _onlyOwnerOrInterceptor now also allows address(entryPoint).
 *   Tests: EntryPoint can call executeTokenSpend; strangers cannot; owner/interceptor still work.
 *
 * ARCH-02 (High): proposeMASSettlement used onlyOwner — blocked EntryPoint for MAS.
 *   Fix: Changed to onlyEntryPointOrOwner.
 *   Tests: EntryPoint can call proposeMASSettlement; stranger cannot; owner still works;
 *          validateUserOp auto-approves it as a protocol op.
 */
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ERC4337.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";
import "../contracts/SettlementCoordinatorV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MegaAuditMockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @dev Minimal recipient wallet stub — just needs to exist for MAS settlement
contract StubRecipientWallet {
    receive() external payable {}
}

contract ARC402WalletMegaAuditTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinatorV2 settlementCoordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;
    MegaAuditMockUSDC usdc;
    StubRecipientWallet recipientWallet;

    address owner      = address(this);
    address entryPoint = address(0xE4337);
    address stranger   = address(0xBB02);
    address interceptor = address(0xC0DE);
    address recipient   = address(0xBEEF);

    bytes32 constant CONTEXT_ID = keccak256("mega-ctx");

    uint256 constant SIG_VALIDATION_SUCCESS = 0;
    uint256 constant SIG_VALIDATION_FAILED  = 1;

    function setUp() public {
        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinatorV2();
        usdc = new MegaAuditMockUSDC();
        recipientWallet = new StubRecipientWallet();

        reg = new ARC402RegistryV2(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator),
            "v1.0.0"
        );

        wallet = new ARC402Wallet(address(reg), owner, entryPoint);
        trustRegistry.addUpdater(address(wallet));

        vm.deal(address(wallet), 10 ether);

        // Fund wallet with USDC
        usdc.transfer(address(wallet), 100_000 * 10**6); // 100k USDC

        // Set category limits
        vm.prank(address(wallet));
        policyEngine.setCategoryLimit("api_call", 10_000 * 10**6); // 10k USDC
        vm.prank(address(wallet));
        policyEngine.setCategoryLimit("mas_settle", 1 ether);

        // Authorize the interceptor
        wallet.setAuthorizedInterceptor(interceptor);

        // Open context for tests that need it
        wallet.openContext(CONTEXT_ID, "mega-audit-task");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _makeTokenAttestation(bytes32 attId, uint256 amount)
        internal
        returns (bytes32)
    {
        return wallet.attest(
            attId, "pay_api", "ARCH-01 test", recipient, amount, address(usdc), 0
        );
    }

    function _makeMASAttestation(bytes32 attId, uint256 amount)
        internal
        returns (bytes32)
    {
        return wallet.attest(
            attId, "mas_settle", "ARCH-02 test", address(recipientWallet), amount, address(0), 0
        );
    }

    function _buildUserOp(bytes memory callData)
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
            signature: ""
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARCH-01: executeTokenSpend — EntryPoint now allowed
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev validateUserOp auto-approves executeTokenSpend as a protocol op
    function test_ARCH01_validateUserOp_autoApproves_executeTokenSpend() public {
        bytes memory callData = abi.encodeWithSignature(
            "executeTokenSpend(address,address,uint256,string,bytes32)",
            address(usdc), recipient, uint256(100 * 10**6), "api_call", keccak256("att")
        );
        PackedUserOperation memory userOp = _buildUserOp(callData);

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("hash"), 0);
        assertEq(result, SIG_VALIDATION_SUCCESS, "executeTokenSpend must auto-approve as protocol op");
    }

    /// @dev EntryPoint can execute executeTokenSpend (ARCH-01 fix)
    function test_ARCH01_entryPoint_canExecuteTokenSpend() public {
        uint256 amount = 100 * 10**6; // 100 USDC
        bytes32 attId = keccak256("arch01-ep-att");
        _makeTokenAttestation(attId, amount);

        uint256 balBefore = usdc.balanceOf(recipient);

        vm.prank(entryPoint);
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);

        assertEq(usdc.balanceOf(recipient) - balBefore, amount, "USDC must transfer to recipient");
    }

    /// @dev Owner can still call executeTokenSpend directly
    function test_ARCH01_owner_canExecuteTokenSpend() public {
        uint256 amount = 100 * 10**6;
        bytes32 attId = keccak256("arch01-owner-att");
        _makeTokenAttestation(attId, amount);

        uint256 balBefore = usdc.balanceOf(recipient);

        // owner == address(this) (test contract)
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);

        assertEq(usdc.balanceOf(recipient) - balBefore, amount);
    }

    /// @dev Authorized interceptor can still call executeTokenSpend
    function test_ARCH01_interceptor_canExecuteTokenSpend() public {
        uint256 amount = 100 * 10**6;
        bytes32 attId = keccak256("arch01-interceptor-att");
        _makeTokenAttestation(attId, amount);

        uint256 balBefore = usdc.balanceOf(recipient);

        vm.prank(interceptor);
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);

        assertEq(usdc.balanceOf(recipient) - balBefore, amount);
    }

    /// @dev Stranger CANNOT call executeTokenSpend (access control intact)
    function test_ARCH01_stranger_cannotExecuteTokenSpend() public {
        uint256 amount = 100 * 10**6;
        bytes32 attId = keccak256("arch01-stranger-att");
        _makeTokenAttestation(attId, amount);

        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);
    }

    /// @dev Frozen wallet blocks executeTokenSpend even from EntryPoint
    function test_ARCH01_frozenWallet_blocksEntryPoint_executeTokenSpend() public {
        uint256 amount = 100 * 10**6;
        bytes32 attId = keccak256("arch01-frozen-att");
        // Create attestation BEFORE freezing (attest has notFrozen modifier)
        _makeTokenAttestation(attId, amount);

        // Now freeze the wallet
        wallet.freeze("security incident");

        vm.prank(entryPoint);
        vm.expectRevert(WFrozen.selector);
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);
    }

    /// @dev validateUserOp returns FAILED for executeTokenSpend when wallet is frozen
    function test_ARCH01_frozenWallet_validateUserOp_failsForTokenSpend() public {
        wallet.freeze("test");

        bytes memory callData = abi.encodeWithSignature(
            "executeTokenSpend(address,address,uint256,string,bytes32)",
            address(usdc), recipient, uint256(100 * 10**6), "api_call", keccak256("att")
        );
        PackedUserOperation memory userOp = _buildUserOp(callData);

        vm.prank(entryPoint);
        uint256 result = wallet.validateUserOp(userOp, keccak256("hash"), 0);
        assertEq(result, SIG_VALIDATION_FAILED, "frozen wallet must fail validation for protocol ops");
    }

    /// @dev Unauthorized interceptor address cannot call executeTokenSpend
    function test_ARCH01_unauthorizedInterceptor_cannotExecuteTokenSpend() public {
        address fakeInterceptor = address(0xF4CE);
        uint256 amount = 100 * 10**6;
        bytes32 attId = keccak256("arch01-fake-att");
        _makeTokenAttestation(attId, amount);

        vm.prank(fakeInterceptor);
        vm.expectRevert(WAuth.selector);
        wallet.executeTokenSpend(address(usdc), recipient, amount, "api_call", attId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARCH-02 (updated): verifyAndConsumeAttestation access control
    //   proposeMASSettlement moved to SettlementCoordinatorV2.proposeFromWallet().
    //   The wallet now exposes verifyAndConsumeAttestation() for the coordinator.
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Only the registered SettlementCoordinator may call verifyAndConsumeAttestation.
    function test_ARCH02_verifyAndConsumeAttestation_onlyCoordinator() public {
        bytes32 attId = keccak256("arch02-vca-att");
        _makeMASAttestation(attId, 0.1 ether);

        // Stranger calling directly must revert
        vm.prank(stranger);
        vm.expectRevert(WNotCoord.selector);
        wallet.verifyAndConsumeAttestation(attId, address(recipientWallet), 0.1 ether, "mas_settle");
    }

    /// @dev The coordinator (SettlementCoordinatorV2) can trigger verifyAndConsumeAttestation
    ///      via proposeFromWallet. End-to-end: wallet calls proposeFromWallet → coordinator
    ///      calls verifyAndConsumeAttestation → attestation consumed → proposal created.
    function test_ARCH02_coordinator_canCallVerifyAndConsume() public {
        uint256 amount = 0.1 ether;
        bytes32 attId = keccak256("arch02-coord-att");
        _makeMASAttestation(attId, amount);

        // Wallet calls proposeFromWallet on V2 coordinator — coordinator internally
        // calls wallet.verifyAndConsumeAttestation(). This should succeed.
        vm.prank(address(wallet));
        settlementCoordinator.proposeFromWallet(address(wallet), address(recipientWallet), amount, "mas_settle", attId);
    }

    /// @dev Frozen wallet is rejected by proposeFromWallet before attestation is touched.
    function test_ARCH02_frozenWallet_blocksCoordinatorPropose() public {
        uint256 amount = 0.1 ether;
        bytes32 attId = keccak256("arch02-frozen-att");
        _makeMASAttestation(attId, amount);
        wallet.freeze("incident");

        vm.prank(address(wallet));
        vm.expectRevert("SCv2: wallet frozen");
        settlementCoordinator.proposeFromWallet(address(wallet), address(recipientWallet), amount, "mas_settle", attId);
    }

    /// @dev verifyAndConsumeAttestation reverts on mismatched attestation.
    function test_ARCH02_verifyAndConsume_badAttestation_reverts() public {
        // Attest for a different recipient
        bytes32 attId = keccak256("arch02-bad-att");
        wallet.attest(attId, "mas_settle", "test", address(0xBAD), 0.1 ether, address(0), 0);

        // Call directly as coordinator (via cheatcode)
        vm.prank(address(settlementCoordinator));
        vm.expectRevert(WAtt.selector);
        wallet.verifyAndConsumeAttestation(attId, address(recipientWallet), 0.1 ether, "mas_settle");
    }
}

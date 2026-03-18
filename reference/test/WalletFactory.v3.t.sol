// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";
import "../contracts/ERC4337.sol";

/// @notice Minimal mock EntryPoint — satisfies IEntryPoint so the wallet constructor doesn't revert.
///         Tests call validateUserOp by pranking as this address directly.
contract MockEntryPoint {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }

    /// @notice Helper: call validateUserOp on a wallet as the EntryPoint.
    ///         Deployed at ENTRY_POINT address via vm.etch so msg.sender == entryPoint.
    function callValidateUserOp(
        address wallet,
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingFunds
    ) external returns (uint256) {
        return IAccount(wallet).validateUserOp(userOp, userOpHash, missingFunds);
    }
}

contract WalletFactoryV3Test is Test {
    // Base Sepolia / Base mainnet ERC-4337 v0.7 EntryPoint
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    PolicyEngine          policyEngine;
    TrustRegistry         trustRegistry;
    IntentAttestation     intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2      reg;
    WalletFactory         factory;
    MockEntryPoint        mockEP;

    uint256 ownerPrivKey = 0xA11CE_CAFE_1234;
    address alice;

    function setUp() public {
        alice = vm.addr(ownerPrivKey);

        // Deploy mock EntryPoint and etch its bytecode at the canonical address.
        // This lets the wallet constructor succeed (entryPoint != address(0))
        // and lets us prank as ENTRY_POINT to call validateUserOp.
        mockEP = new MockEntryPoint();
        vm.etch(ENTRY_POINT, address(mockEP).code);

        policyEngine          = new PolicyEngine();
        trustRegistry         = new TrustRegistry();
        intentAttestation     = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinator();

        reg = new ARC402RegistryV2(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator),
            "v3.0.0"
        );

        factory = new WalletFactory(address(reg));
    }

    // ── 1. EntryPoint address ────────────────────────────────────────────────

    function test_walletHasCorrectEntryPoint() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));
        assertEq(
            address(ARC402Wallet(payable(walletAddr)).entryPoint()),
            ENTRY_POINT,
            "entryPoint must equal DEFAULT_ENTRY_POINT"
        );
    }

    // Passing a custom entryPoint address also works and is stored correctly
    function test_walletHasCustomEntryPoint() public {
        address customEP = address(0xEE00);
        vm.etch(customEP, address(mockEP).code); // must be non-zero code to pass constructor check
        vm.prank(alice);
        address walletAddr = factory.createWallet(customEP);
        assertEq(
            address(ARC402Wallet(payable(walletAddr)).entryPoint()),
            customEP,
            "entryPoint must equal the provided custom address"
        );
    }

    // ── 2. Owner address ─────────────────────────────────────────────────────

    function test_walletHasCorrectOwner() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));
        assertEq(
            ARC402Wallet(payable(walletAddr)).owner(),
            alice,
            "wallet owner must be the caller, not the factory"
        );
    }

    // ── 3. Protocol UserOp — auto-approve (returns 0) ────────────────────────

    function test_validateUserOp_protocolOp_returns0() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));

        // A non-governance selector (executeSpend) → protocol path → auto-approve
        PackedUserOperation memory userOp;
        userOp.sender   = walletAddr;
        userOp.callData = abi.encodeWithSelector(
            ARC402Wallet.executeSpend.selector,
            address(0x1),
            uint256(100),
            "api",
            bytes32(0)
        );
        userOp.signature = "";

        vm.prank(ENTRY_POINT);
        uint256 result = ARC402Wallet(payable(walletAddr)).validateUserOp(userOp, bytes32(0), 0);
        assertEq(result, 0, "protocol op must return 0 (success)");
    }

    // ── 4. Governance UserOp, no signature — rejected (returns 1) ────────────

    function test_validateUserOp_governanceOp_noSig_returns1() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));

        PackedUserOperation memory userOp;
        userOp.sender    = walletAddr;
        userOp.callData  = abi.encodeWithSelector(ARC402Wallet.setGuardian.selector, address(0x123));
        userOp.signature = ""; // no signature

        vm.prank(ENTRY_POINT);
        uint256 result = ARC402Wallet(payable(walletAddr)).validateUserOp(userOp, bytes32(0), 0);
        assertEq(result, 1, "governance op with no sig must return 1 (failed)");
    }

    // ── 5. Governance UserOp, valid owner signature — accepted (returns 0) ───

    function test_validateUserOp_governanceOp_validOwnerSig_returns0() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));

        bytes32 userOpHash = keccak256("test-governance-op-hash");

        // ARC402Wallet._validateOwnerSignature calls MessageHashUtils.toEthSignedMessageHash,
        // which prepends "\x19Ethereum Signed Message:\n32".
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivKey, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        PackedUserOperation memory userOp;
        userOp.sender    = walletAddr;
        userOp.callData  = abi.encodeWithSelector(ARC402Wallet.setGuardian.selector, address(0x123));
        userOp.signature = sig;

        vm.prank(ENTRY_POINT);
        uint256 result = ARC402Wallet(payable(walletAddr)).validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "governance op with valid owner sig must return 0 (success)");
    }

    // Sanity: wrong signer → still fails
    function test_validateUserOp_governanceOp_wrongSig_returns1() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));

        bytes32 userOpHash = keccak256("test-governance-op-hash");
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        uint256 notOwnerKey = 0xBADC0DE;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(notOwnerKey, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        PackedUserOperation memory userOp;
        userOp.sender    = walletAddr;
        userOp.callData  = abi.encodeWithSelector(ARC402Wallet.setGuardian.selector, address(0x123));
        userOp.signature = sig;

        vm.prank(ENTRY_POINT);
        uint256 result = ARC402Wallet(payable(walletAddr)).validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "governance op signed by wrong key must return 1");
    }

    // ── 6. TrustRegistry: initWallet called ──────────────────────────────────

    function test_walletInitializedInTrustRegistry() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));
        assertEq(
            trustRegistry.getScore(walletAddr),
            100,
            "trust score must be initialized to 100"
        );
    }

    // ── 7. PolicyEngine: registerWallet called ────────────────────────────────

    function test_walletRegisteredInPolicyEngine() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet(address(0));
        assertEq(
            policyEngine.walletOwners(walletAddr),
            alice,
            "PolicyEngine must record alice as wallet owner"
        );
    }

    // ── 8. Two wallets from same factory have different addresses ─────────────

    function test_twoWallets_differentAddresses() public {
        vm.startPrank(alice);
        address wallet1 = factory.createWallet(address(0));
        address wallet2 = factory.createWallet(address(0));
        vm.stopPrank();

        assertTrue(wallet1 != wallet2, "each wallet deployment must produce a distinct address");
    }

    // ── 9. Zero owner reverts ─────────────────────────────────────────────────

    /// @notice WalletFactory always uses msg.sender as owner, so address(0) owner
    ///         can only be triggered by deploying ARC402Wallet directly.
    function test_zeroOwner_reverts() public {
        vm.expectRevert(WZero.selector);
        new ARC402Wallet(address(reg), address(0), ENTRY_POINT);
    }

    // ── Bonus: WalletCreated event emitted ────────────────────────────────────

    function test_walletCreatedEvent_emitted() public {
        vm.prank(alice);
        vm.recordLogs();
        address walletAddr = factory.createWallet(address(0));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // WalletCreated(address indexed owner, address indexed walletAddress)
        bytes32 eventSig = keccak256("WalletCreated(address,address)");
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == eventSig) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), alice);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), walletAddr);
                found = true;
                break;
            }
        }
        assertTrue(found, "WalletCreated event must be emitted");
    }
}

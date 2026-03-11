// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ARC402Registry.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

contract WalletFactoryTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402Registry reg;
    WalletFactory factory;

    address alice = address(0xA11CE);

    function setUp() public {
        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinator();

        reg = new ARC402Registry(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator),
            "v1.0.0"
        );

        factory = new WalletFactory(address(reg));
    }

    function test_createWallet() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet();

        // Owner mapping contains the new wallet
        address[] memory wallets = factory.getWallets(alice);
        assertEq(wallets.length, 1);
        assertEq(wallets[0], walletAddr);

        // Trust score initialized
        assertEq(trustRegistry.getScore(walletAddr), 100);
    }

    function test_createMultipleWallets() public {
        vm.startPrank(alice);
        address wallet1 = factory.createWallet();
        address wallet2 = factory.createWallet();
        vm.stopPrank();

        address[] memory wallets = factory.getWallets(alice);
        assertEq(wallets.length, 2);
        assertEq(wallets[0], wallet1);
        assertEq(wallets[1], wallet2);

        // Both wallets have trust initialized
        assertEq(trustRegistry.getScore(wallet1), 100);
        assertEq(trustRegistry.getScore(wallet2), 100);
    }

    function test_totalWallets() public {
        assertEq(factory.totalWallets(), 0);

        vm.prank(alice);
        factory.createWallet();
        assertEq(factory.totalWallets(), 1);

        vm.prank(address(0xB0B));
        factory.createWallet();
        assertEq(factory.totalWallets(), 2);
    }

    function test_createWallet_OwnerIsUser() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet();
        ARC402Wallet wallet = ARC402Wallet(payable(walletAddr));
        assertEq(wallet.owner(), alice, "Wallet owner must be user, not factory");
    }

    function test_walletPointsToCanonical() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet();

        ARC402Wallet wallet = ARC402Wallet(payable(walletAddr));
        // Wallet should point at the same registry the factory used
        assertEq(address(wallet.registry()), address(reg));
        // Registry addresses match canonical infrastructure
        assertEq(wallet.registry().policyEngine(), address(policyEngine));
        assertEq(wallet.registry().trustRegistry(), address(trustRegistry));
        assertEq(wallet.registry().intentAttestation(), address(intentAttestation));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

contract WalletFactoryTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    WalletFactory factory;

    address alice = address(0xA11CE);

    function setUp() public {
        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinator();

        factory = new WalletFactory(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator)
        );
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

    function test_walletPointsToCanonical() public {
        vm.prank(alice);
        address walletAddr = factory.createWallet();

        ARC402Wallet wallet = ARC402Wallet(payable(walletAddr));
        assertEq(address(wallet.policyEngine()), address(policyEngine));
        assertEq(address(wallet.trustRegistry()), address(trustRegistry));
        assertEq(address(wallet.intentAttestation()), address(intentAttestation));
    }
}

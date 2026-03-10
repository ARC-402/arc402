// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";

contract ARC402WalletTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    ARC402Wallet wallet;

    address owner = address(this);
    address recipient = address(0xBEEF);
    bytes32 constant CONTEXT_ID = keccak256("context-1");
    bytes32 constant ATTEST_ID = keccak256("intent-1");

    function setUp() public {
        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();

        wallet = new ARC402Wallet(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation)
        );

        // Add wallet as trusted updater
        trustRegistry.addUpdater(address(wallet));

        // Fund wallet
        vm.deal(address(wallet), 10 ether);

        // Set policy for claims category
        vm.prank(address(wallet));
        policyEngine.setCategoryLimit("claims", 0.5 ether);
    }

    function test_openContext() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        (bytes32 ctxId, string memory taskType, , bool open) = wallet.getActiveContext();
        assertEq(ctxId, CONTEXT_ID);
        assertEq(taskType, "claims_processing");
        assertTrue(open);
    }

    function test_openContext_alreadyOpen() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        vm.expectRevert("ARC402: context already open");
        wallet.openContext(keccak256("context-2"), "other");
    }

    function test_closeContext() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        wallet.closeContext();
        (, , , bool open) = wallet.getActiveContext();
        assertFalse(open);
    }

    function test_closeContext_noContext() public {
        vm.expectRevert("ARC402: no active context");
        wallet.closeContext();
    }

    function test_fullFlow_openExecuteClose() public {
        // Open context
        wallet.openContext(CONTEXT_ID, "claims_processing");

        // Create attestation from wallet
        vm.prank(address(wallet));
        intentAttestation.attest(ATTEST_ID, "pay_provider", "Payment for claim #1", recipient, 0.1 ether);

        // Execute spend
        uint256 balanceBefore = recipient.balance;
        wallet.executeSpend(payable(recipient), 0.1 ether, "claims", ATTEST_ID);
        assertEq(recipient.balance - balanceBefore, 0.1 ether);

        // Close context - trust score should increase
        uint256 scoreBefore = wallet.getTrustScore();
        wallet.closeContext();
        uint256 scoreAfter = wallet.getTrustScore();
        assertEq(scoreAfter, scoreBefore + 5);
    }

    function test_executeSpend_noContext() public {
        vm.prank(address(wallet));
        intentAttestation.attest(ATTEST_ID, "pay", "Test", recipient, 0.1 ether);
        vm.expectRevert("ARC402: no active context");
        wallet.executeSpend(payable(recipient), 0.1 ether, "claims", ATTEST_ID);
    }

    function test_executeSpend_invalidAttestation() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        vm.expectRevert("ARC402: invalid intent attestation");
        wallet.executeSpend(payable(recipient), 0.1 ether, "claims", bytes32(uint256(999)));
    }

    function test_executeSpend_policyViolation() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        vm.prank(address(wallet));
        intentAttestation.attest(ATTEST_ID, "pay", "Test", recipient, 1 ether);
        vm.expectRevert("PolicyEngine: amount exceeds category limit");
        wallet.executeSpend(payable(recipient), 1 ether, "claims", ATTEST_ID);
    }

    function test_getTrustScore_initial() public {
        assertEq(wallet.getTrustScore(), 100);
    }
}

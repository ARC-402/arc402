// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/SettlementCoordinatorV2.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SettlementCoordinatorV2Test
 * @notice Tests for SettlementCoordinatorV2.proposeFromWallet() and all inherited
 *         V1-compatible settlement functions.
 */
contract SettlementCoordinatorV2Test is Test {
    // ─── Infrastructure ───────────────────────────────────────────────────────

    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinatorV2 coordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;

    address owner = address(this);
    address machineKey = address(0xBEEF1);
    address recipientWallet = address(0xC0FFEE);

    bytes32 constant CONTEXT_ID = keccak256("ctx-v2-1");
    bytes32 constant ATTEST_ID  = keccak256("att-v2-1");

    uint256 constant AMOUNT = 0.1 ether;

    // ─── Setup ───────────────────────────────────────────────────────────────

    function setUp() public {
        policyEngine    = new PolicyEngine();
        trustRegistry   = new TrustRegistry();
        intentAttestation = new IntentAttestation();
        coordinator     = new SettlementCoordinatorV2();

        reg = new ARC402RegistryV2(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(coordinator),
            "v2.0.0"
        );

        wallet = new ARC402Wallet(address(reg), owner, address(0xE4337));
        trustRegistry.addUpdater(address(wallet));
        vm.deal(address(wallet), 10 ether);

        // Policy: claims category up to 1 ETH
        vm.prank(address(wallet));
        policyEngine.setCategoryLimit("claims", 1 ether);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// @dev Open a context on the wallet and attest an intent.
    function _openAndAttest(bytes32 contextId, bytes32 attestId, address recipient, uint256 amount) internal {
        wallet.openContext(contextId, "claims_processing");
        wallet.attest(attestId, "settle_claim", "settlement test", recipient, amount, address(0), 0);
    }

    /// @dev Call proposeFromWallet as the wallet itself (most common path).
    function _proposeAsWallet(bytes32 attestId, uint256 amount) internal returns (bytes32 proposalId) {
        vm.recordLogs();
        vm.prank(address(wallet));
        coordinator.proposeFromWallet(address(wallet), recipientWallet, amount, "claims", attestId);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("ProposalCreated(bytes32,address,address,uint256,address)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == topic) {
                return logs[i].topics[1];
            }
        }
        revert("ProposalCreated not found");
    }

    // ─── proposeFromWallet: happy paths ──────────────────────────────────────

    function test_proposeFromWallet_byWallet_success() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        bytes32 pid = _proposeAsWallet(ATTEST_ID, AMOUNT);

        (
            address from,
            address to,
            uint256 amt,
            address token,
            bytes32 intentId,
            ,
            ,
            SettlementCoordinatorV2.ProposalStatus status,
        ) = coordinator.getProposal(pid);

        assertEq(from,     address(wallet));
        assertEq(to,       recipientWallet);
        assertEq(amt,      AMOUNT);
        assertEq(token,    address(0));
        assertEq(intentId, ATTEST_ID);
        assertEq(uint256(status), uint256(SettlementCoordinatorV2.ProposalStatus.PENDING));
    }

    function test_proposeFromWallet_byMachineKey_success() public {
        // Authorize a machine key on the wallet
        wallet.authorizeMachineKey(machineKey);

        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        // Machine key calls proposeFromWallet directly — no wallet wrapper needed
        vm.recordLogs();
        vm.prank(machineKey); // msg.sender = machineKey, not walletAddress
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        bytes32 topic = keccak256("ProposalCreated(bytes32,address,address,uint256,address)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == topic) { found = true; break; }
        }
        assertTrue(found, "ProposalCreated not emitted for machine key path");
    }

    function test_proposeFromWallet_emitsSettlementProposed() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        vm.expectEmit(true, true, false, true, address(coordinator));
        emit SettlementCoordinatorV2.SettlementProposed(address(wallet), recipientWallet, AMOUNT, ATTEST_ID);

        vm.prank(address(wallet));
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    // ─── proposeFromWallet: auth failures ────────────────────────────────────

    function test_proposeFromWallet_rejects_unauthorizedCaller() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        address attacker = address(0xDEAD);
        vm.prank(attacker);
        vm.expectRevert("SCv2: not authorized");
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    function test_proposeFromWallet_rejects_ownerDirectly() public {
        // The owner (EOA) calling proposeFromWallet is NOT the wallet — wallet is a contract.
        // Owner is address(this); wallet is a separate contract address.
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        // owner != walletAddress and owner not a machine key → must revert
        vm.expectRevert("SCv2: not authorized");
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    // ─── proposeFromWallet: wallet state checks ───────────────────────────────

    function test_proposeFromWallet_rejects_frozenWallet() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        wallet.freeze("security incident");
        assertTrue(wallet.frozen());

        vm.prank(address(wallet));
        vm.expectRevert("SCv2: wallet frozen");
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    function test_proposeFromWallet_rejects_noOpenContext() public {
        // F-03: attest() now requires requireOpenContext, so we must open context, attest,
        // then close it. proposeFromWallet should then fail because context is no longer open.
        wallet.openContext(CONTEXT_ID, "claims_processing");
        wallet.attest(ATTEST_ID, "settle_claim", "test", recipientWallet, AMOUNT, address(0), 0);
        wallet.closeContext();

        vm.prank(address(wallet));
        vm.expectRevert("SCv2: no open context");
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    // ─── proposeFromWallet: attestation / policy failures ────────────────────

    function test_proposeFromWallet_rejects_badAttestation() public {
        wallet.openContext(CONTEXT_ID, "claims_processing");
        // Attest for a DIFFERENT recipient
        wallet.attest(ATTEST_ID, "settle_claim", "test", address(0xBAD), AMOUNT, address(0), 0);

        vm.prank(address(wallet));
        vm.expectRevert(WAtt.selector);
        // Provide the correct recipientWallet — attestation mismatch triggers WAtt
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    function test_proposeFromWallet_rejects_attestationReplay() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);
        vm.prank(address(wallet)); coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);

        // Reopen context and try to reuse the consumed attestation
        wallet.closeContext();
        bytes32 ctx2 = keccak256("ctx-replay");
        wallet.openContext(ctx2, "claims_processing");

        vm.prank(address(wallet));
        vm.expectRevert(WAtt.selector);
        coordinator.proposeFromWallet(address(wallet), recipientWallet, AMOUNT, "claims", ATTEST_ID);
    }

    function test_proposeFromWallet_rejects_policyViolation() public {
        uint256 tooMuch = 2 ether; // policy limit is 1 ETH
        wallet.openContext(CONTEXT_ID, "claims_processing");
        wallet.attest(ATTEST_ID, "settle_claim", "too much", recipientWallet, tooMuch, address(0), 0);

        vm.prank(address(wallet));
        vm.expectRevert("PolicyEngine: amount exceeds per-tx limit");
        coordinator.proposeFromWallet(address(wallet), recipientWallet, tooMuch, "claims", ATTEST_ID);
    }

    // ─── proposeFromWallet → accept → execute flow ───────────────────────────

    function test_proposeFromWallet_fullSettlementFlow() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);

        bytes32 pid = _proposeAsWallet(ATTEST_ID, AMOUNT);

        // Recipient accepts
        vm.prank(recipientWallet);
        coordinator.accept(pid);
        (,,,,,,, SettlementCoordinatorV2.ProposalStatus statusAfterAccept,) = coordinator.getProposal(pid);
        assertEq(uint256(statusAfterAccept), uint256(SettlementCoordinatorV2.ProposalStatus.ACCEPTED));

        // Wallet executes
        uint256 balBefore = recipientWallet.balance;
        vm.prank(address(wallet));
        coordinator.execute{value: AMOUNT}(pid);
        assertEq(recipientWallet.balance - balBefore, AMOUNT);

        (,,,,,,, SettlementCoordinatorV2.ProposalStatus statusFinal,) = coordinator.getProposal(pid);
        assertEq(uint256(statusFinal), uint256(SettlementCoordinatorV2.ProposalStatus.EXECUTED));
    }

    // ─── V1-compatible propose() still enforces SC-AUTH ──────────────────────

    function test_propose_requiresCallerIsFromWallet() public {
        address attacker = address(0xDEAD);
        vm.prank(attacker);
        vm.expectRevert("SC: caller must be fromWallet");
        coordinator.propose(address(0xABCD), recipientWallet, AMOUNT, address(0), ATTEST_ID, block.timestamp + 1 hours);
    }

    // ─── expireAccepted after execution window ────────────────────────────────

    function test_expireAccepted_afterWindow() public {
        _openAndAttest(CONTEXT_ID, ATTEST_ID, recipientWallet, AMOUNT);
        bytes32 pid = _proposeAsWallet(ATTEST_ID, AMOUNT);

        vm.prank(recipientWallet);
        coordinator.accept(pid);

        vm.warp(block.timestamp + 7 days + 1);
        coordinator.expireAccepted(pid);

        (,,,,,,, SettlementCoordinatorV2.ProposalStatus status,) = coordinator.getProposal(pid);
        assertEq(uint256(status), uint256(SettlementCoordinatorV2.ProposalStatus.EXPIRED));
    }
}

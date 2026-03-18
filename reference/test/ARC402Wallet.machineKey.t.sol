// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Access-control tests for ARC402Wallet with machine key support.
 *
 * Access model:
 *   - Protocol ops (openContext, attest, executeSpend): owner OR authorizedMachineKey
 *   - Governance ops (setGuardian, updatePolicy, etc.): entryPoint OR owner
 *   - DeFi ops (executeContractCall): entryPoint OR owner
 *
 * Machine keys enable autonomous agent operations without owner signature.
 * EntryPoint is for owner-signed UserOps targeting governance/DeFi functions.
 */
import "forge-std/Test.sol";
import "../contracts/ARC402Wallet.sol";
import "../contracts/ARC402RegistryV2.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";

/// @dev Minimal contract that records incoming calls for testing executeContractCall.
contract CallRecorder {
    uint256 public callCount;
    address public lastCaller;

    function ping() external returns (bool) {
        callCount++;
        lastCaller = msg.sender;
        return true;
    }

    receive() external payable {}
}

contract ARC402WalletEntryPointAccessTest is Test {
    PolicyEngine policyEngine;
    TrustRegistry trustRegistry;
    IntentAttestation intentAttestation;
    SettlementCoordinator settlementCoordinator;
    ARC402RegistryV2 reg;
    ARC402Wallet wallet;
    CallRecorder recorder;

    address owner      = address(this);
    address entryPoint = address(0xE4337);
    address stranger   = address(0xBB02);

    function setUp() public {
        policyEngine = new PolicyEngine();
        trustRegistry = new TrustRegistry();
        intentAttestation = new IntentAttestation();
        settlementCoordinator = new SettlementCoordinator();
        recorder = new CallRecorder();

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

        // Whitelist the recorder contract for this wallet
        vm.prank(address(wallet));
        policyEngine.whitelistContract(address(wallet), address(recorder));
    }

    // ─── entryPoint stored correctly ─────────────────────────────────────────

    function test_entryPoint_storedImmutably() public view {
        assertEq(address(wallet.entryPoint()), entryPoint);
    }

    // ─── onlyEntryPointOrOwner: executeContractCall ───────────────────────────

    function test_owner_canCallExecuteContractCall() public {
        ARC402Wallet.ContractCallParams memory params = ARC402Wallet.ContractCallParams({
            target: address(recorder),
            data: abi.encodeWithSignature("ping()"),
            value: 0,
            minReturnValue: 0,
            maxApprovalAmount: 0,
            approvalToken: address(0)
        });
        wallet.executeContractCall(params);
        assertEq(recorder.callCount(), 1);
    }

    function test_entryPoint_canCallExecuteContractCall() public {
        ARC402Wallet.ContractCallParams memory params = ARC402Wallet.ContractCallParams({
            target: address(recorder),
            data: abi.encodeWithSignature("ping()"),
            value: 0,
            minReturnValue: 0,
            maxApprovalAmount: 0,
            approvalToken: address(0)
        });
        vm.prank(entryPoint);
        wallet.executeContractCall(params);
        assertEq(recorder.callCount(), 1);
        assertEq(recorder.lastCaller(), address(wallet));
    }

    function test_stranger_cannotCallExecuteContractCall() public {
        ARC402Wallet.ContractCallParams memory params = ARC402Wallet.ContractCallParams({
            target: address(recorder),
            data: abi.encodeWithSignature("ping()"),
            value: 0,
            minReturnValue: 0,
            maxApprovalAmount: 0,
            approvalToken: address(0)
        });
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.executeContractCall(params);
    }

    // ─── onlyOwnerOrMachineKey: openContext / closeContext ────────────────────
    //
    // Protocol ops use onlyOwnerOrMachineKey — EntryPoint is NOT allowed.
    // This prevents unauthorized UserOps from manipulating wallet state.

    function test_entryPoint_cannotOpenContext() public {
        vm.prank(entryPoint);
        vm.expectRevert(WAuth.selector);
        wallet.openContext(keccak256("ctx"), "task");
    }

    function test_entryPoint_cannotCloseContext() public {
        wallet.openContext(keccak256("ctx"), "task");
        vm.prank(entryPoint);
        vm.expectRevert(WAuth.selector);
        wallet.closeContext();
    }

    function test_owner_canOpenContext() public {
        wallet.openContext(keccak256("ctx"), "task");
        assertTrue(wallet.contextOpen());
        assertEq(wallet.activeContextId(), keccak256("ctx"));
    }

    function test_machineKey_canOpenContext() public {
        address machineKey = address(0xA6E47);
        wallet.authorizeMachineKey(machineKey);
        vm.prank(machineKey);
        wallet.openContext(keccak256("ctx"), "task");
        assertTrue(wallet.contextOpen());
    }

    function test_stranger_cannotOpenContext() public {
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.openContext(keccak256("ctx"), "task");
    }

    // ─── onlyOwnerOrMachineKey: attest ────────────────────────────────────────

    function test_entryPoint_cannotAttest() public {
        vm.prank(entryPoint);
        vm.expectRevert(WAuth.selector);
        wallet.attest(keccak256("att"), "action", "reason", address(0xBEEF), 1 ether, address(0), 0);
    }

    function test_owner_canAttest() public {
        // F-03: attest() now requires requireOpenContext
        wallet.openContext(keccak256("ctx"), "task");
        bytes32 attId = wallet.attest(
            keccak256("att"), "action", "reason", address(0xBEEF), 1 ether, address(0), 0
        );
        assertEq(attId, keccak256("att"));
    }

    function test_machineKey_canAttest() public {
        address machineKey = address(0xA6E47);
        wallet.authorizeMachineKey(machineKey);
        // F-03: attest() now requires requireOpenContext; machine key can open context first
        vm.prank(machineKey);
        wallet.openContext(keccak256("ctx"), "task");
        vm.prank(machineKey);
        bytes32 attId = wallet.attest(
            keccak256("att"), "action", "reason", address(0xBEEF), 1 ether, address(0), 0
        );
        assertEq(attId, keccak256("att"));
    }

    function test_stranger_cannotAttest() public {
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.attest(keccak256("att"), "action", "reason", address(0xBEEF), 1 ether, address(0), 0);
    }

    // ─── onlyOwnerOrMachineKey: executeSpend ─────────────────────────────────

    function test_entryPoint_canCallExecuteSpend_butFailsWithoutAttestation() public {
        // F-08 fix: EntryPoint is now an authorized caller for executeSpend.
        // It no longer reverts with WAuth; instead it proceeds to WAtt (no valid attestation).
        wallet.openContext(keccak256("ctx"), "task");
        vm.prank(entryPoint);
        vm.expectRevert(WAtt.selector);
        wallet.executeSpend(payable(address(0xBEEF)), 0.01 ether, "claims", keccak256("att"));
    }

    function test_stranger_cannotCallExecuteSpend() public {
        wallet.openContext(keccak256("ctx"), "task");
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.executeSpend(payable(address(0xBEEF)), 0.01 ether, "claims", keccak256("att"));
    }

    // ─── Machine key authorization guards ────────────────────────────────────

    function test_authorizeMachineKey_blocksEntryPoint() public {
        vm.expectRevert(WAuth.selector);
        wallet.authorizeMachineKey(entryPoint);
    }

    function test_authorizeMachineKey_blocksOwner() public {
        vm.expectRevert(WAuth.selector);
        wallet.authorizeMachineKey(owner);
    }

    function test_authorizeMachineKey_blocksZeroAddress() public {
        vm.expectRevert(WZero.selector);
        wallet.authorizeMachineKey(address(0));
    }

    function test_authorizeMachineKey_blocksGuardian() public {
        wallet.setGuardian(address(0x60A8D));
        vm.expectRevert(WAuth.selector);
        wallet.authorizeMachineKey(address(0x60A8D));
    }

    // ─── Governance: EntryPoint allowed (validateUserOp is the auth gate) ────
    //
    // AUD-4337-01 fix: governance functions now use onlyEntryPointOrOwner so that
    // a governance UserOp (with valid owner signature verified by validateUserOp)
    // can actually execute. The security gate is validateUserOp, not the function
    // modifier. The EntryPoint is trusted to call governance functions only after
    // the owner signature has been verified.

    function test_entryPoint_canCallSetGuardianDirectly() public {
        vm.prank(entryPoint);
        wallet.setGuardian(address(0xDEAD));
        assertEq(wallet.guardian(), address(0xDEAD));
    }

    function test_entryPoint_canCallFreezeDirectly() public {
        vm.prank(entryPoint);
        wallet.freeze("ep-freeze");
        assertTrue(wallet.frozen());
    }

    function test_entryPoint_canCallUpdatePolicyDirectly() public {
        bytes32 newPolicy = keccak256("new-policy");
        vm.prank(entryPoint);
        wallet.updatePolicy(newPolicy);
        assertEq(wallet.activePolicyId(), newPolicy);
    }

    function test_entryPoint_canCallProposeRegistryUpdateDirectly() public {
        vm.prank(entryPoint);
        wallet.proposeRegistryUpdate(address(0x1234));
        assertEq(wallet.pendingRegistry(), address(0x1234));
    }

    function test_entryPoint_canCallSetVelocityLimitDirectly() public {
        vm.prank(entryPoint);
        wallet.setVelocityLimit(5 ether);
        assertEq(wallet.velocityLimit(), 5 ether);
    }

    // Strangers still cannot call governance functions
    function test_stranger_cannotCallSetGuardian() public {
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.setGuardian(address(0xDEAD));
    }

    function test_stranger_cannotCallFreeze() public {
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.freeze("attack");
    }

    // ─── Self-target defense still applies ───────────────────────────────────

    function test_entryPoint_cannotTargetSelf() public {
        ARC402Wallet.ContractCallParams memory params = ARC402Wallet.ContractCallParams({
            target: address(wallet),
            data: abi.encodeWithSignature("setGuardian(address)", address(0xDEAD)),
            value: 0,
            minReturnValue: 0,
            maxApprovalAmount: 0,
            approvalToken: address(0)
        });
        vm.prank(entryPoint);
        vm.expectRevert(WSelf.selector);
        wallet.executeContractCall(params);
        assertEq(wallet.guardian(), address(0));
    }

    // ─── Frozen wallet blocks entryPoint too ─────────────────────────────────

    function test_frozenWallet_blocksEntryPoint() public {
        wallet.freeze("test");

        ARC402Wallet.ContractCallParams memory params = ARC402Wallet.ContractCallParams({
            target: address(recorder),
            data: abi.encodeWithSignature("ping()"),
            value: 0,
            minReturnValue: 0,
            maxApprovalAmount: 0,
            approvalToken: address(0)
        });
        vm.prank(entryPoint);
        vm.expectRevert(WFrozen.selector);
        wallet.executeContractCall(params);
    }

    // ─── Machine key lifecycle ────────────────────────────────────────────────

    function test_machineKey_canBeRevoked() public {
        address machineKey = address(0xA6E47);
        wallet.authorizeMachineKey(machineKey);
        assertTrue(wallet.authorizedMachineKeys(machineKey));

        wallet.revokeMachineKey(machineKey);
        assertFalse(wallet.authorizedMachineKeys(machineKey));

        // After revocation, machine key cannot call protocol ops
        vm.prank(machineKey);
        vm.expectRevert(WAuth.selector);
        wallet.openContext(keccak256("ctx"), "task");
    }

    function test_onlyOwner_canAuthorizeMachineKey() public {
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.authorizeMachineKey(address(0xA6E47));
    }

    function test_onlyOwner_canRevokeMachineKey() public {
        wallet.authorizeMachineKey(address(0xA6E47));
        vm.prank(stranger);
        vm.expectRevert(WAuth.selector);
        wallet.revokeMachineKey(address(0xA6E47));
    }
}

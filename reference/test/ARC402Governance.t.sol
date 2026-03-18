// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ARC402Governance.sol";
import "../contracts/CapabilityRegistry.sol";
import "../contracts/GovernedTokenWhitelist.sol";
import "../contracts/TrustRegistryV3.sol";
import "../contracts/AgentRegistry.sol";
import "../contracts/TrustRegistry.sol";

contract ARC402GovernanceTest is Test {
    ARC402Governance governance;
    CapabilityRegistry capabilityRegistry;
    GovernedTokenWhitelist tokenWhitelist;
    TrustRegistryV3 trustRegistryV2;
    AgentRegistry agentRegistry;
    TrustRegistry trustRegistry;

    address signer1 = address(0x1001);
    address signer2 = address(0x1002);
    address signer3 = address(0x1003);
    address outsider = address(0x9999);

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        governance = new ARC402Governance(signers, 2);

        trustRegistry = new TrustRegistry();
        agentRegistry = new AgentRegistry(address(trustRegistry));
        capabilityRegistry = new CapabilityRegistry(address(agentRegistry), address(this));
        tokenWhitelist = new GovernedTokenWhitelist(address(this));
        trustRegistryV2 = new TrustRegistryV3(address(0));

        capabilityRegistry.transferOwnership(address(governance));
        tokenWhitelist.transferOwnership(address(governance));
        trustRegistryV2.transferOwnership(address(governance));

        vm.prank(address(governance));
        capabilityRegistry.acceptOwnership();
        vm.prank(address(governance));
        tokenWhitelist.acceptOwnership();
        vm.prank(address(governance));
        trustRegistryV2.acceptOwnership();
    }

    function test_MultisigExecutesCapabilityRootGovernance() public {
        bytes memory callData = abi.encodeWithSelector(CapabilityRegistry.registerRoot.selector, "legal");

        vm.prank(signer1);
        uint256 txId = governance.submitTransaction(address(capabilityRegistry), 0, callData);

        vm.prank(signer2);
        governance.confirmTransaction(txId);

        vm.prank(signer1);
        governance.executeTransaction(txId);

        assertTrue(capabilityRegistry.isRootActive("legal"));
    }

    function test_MultisigExecutesTokenWhitelistUpdate() public {
        address token = address(0xBEEF);
        bytes memory callData = abi.encodeWithSelector(GovernedTokenWhitelist.setToken.selector, token, true);

        vm.prank(signer1);
        uint256 txId = governance.submitTransaction(address(tokenWhitelist), 0, callData);
        vm.prank(signer3);
        governance.confirmTransaction(txId);
        vm.prank(signer2);
        governance.executeTransaction(txId);

        assertTrue(tokenWhitelist.isWhitelisted(token));
    }

    function test_MultisigExecutesProtocolParameterUpdate() public {
        bytes memory callData = abi.encodeWithSelector(TrustRegistryV3.setMinimumAgreementValue.selector, 5 ether);

        vm.prank(signer1);
        uint256 txId = governance.submitTransaction(address(trustRegistryV2), 0, callData);
        vm.prank(signer2);
        governance.confirmTransaction(txId);
        vm.prank(signer3);
        governance.executeTransaction(txId);

        assertEq(trustRegistryV2.minimumAgreementValue(), 5 ether);
    }

    function test_RevertExecuteWithoutThreshold() public {
        bytes memory callData = abi.encodeWithSelector(TrustRegistryV3.setMinimumAgreementValue.selector, 1 ether);

        vm.prank(signer1);
        uint256 txId = governance.submitTransaction(address(trustRegistryV2), 0, callData);

        vm.prank(signer1);
        vm.expectRevert("ARC402Governance: insufficient confirmations");
        governance.executeTransaction(txId);
    }

    function test_RevokeConfirmationBlocksExecution() public {
        bytes memory callData = abi.encodeWithSelector(GovernedTokenWhitelist.setToken.selector, address(0xCAFE), true);

        vm.prank(signer1);
        uint256 txId = governance.submitTransaction(address(tokenWhitelist), 0, callData);
        vm.prank(signer2);
        governance.confirmTransaction(txId);
        vm.prank(signer2);
        governance.revokeConfirmation(txId);

        vm.prank(signer3);
        vm.expectRevert("ARC402Governance: insufficient confirmations");
        governance.executeTransaction(txId);
    }

    function test_RevertIfOutsiderSubmits() public {
        vm.prank(outsider);
        vm.expectRevert("ARC402Governance: not signer");
        governance.submitTransaction(address(tokenWhitelist), 0, "");
    }
}

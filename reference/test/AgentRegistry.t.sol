// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/AgentRegistry.sol";
import "../contracts/TrustRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    TrustRegistry trustRegistry;

    address alice = address(0x1111);
    address bob   = address(0x2222);
    address carol = address(0x3333);

    string[] caps1;
    string[] caps2;

    function setUp() public {
        trustRegistry = new TrustRegistry();
        registry = new AgentRegistry(address(trustRegistry));

        caps1 = new string[](2);
        caps1[0] = "text-generation";
        caps1[1] = "code-review";

        caps2 = new string[](1);
        caps2[0] = "image-synthesis";
    }

    function _registerAlice() internal {
        vm.prank(alice);
        registry.register("Alice Agent", caps1, "LLM", "https://alice.example", "ipfs://QmAlice");
    }

    function test_Register() public {
        _registerAlice();

        IAgentRegistry.AgentInfo memory info = registry.getAgent(alice);

        assertEq(info.wallet, alice);
        assertEq(info.name, "Alice Agent");
        assertEq(info.serviceType, "LLM");
        assertEq(info.endpoint, "https://alice.example");
        assertEq(info.metadataURI, "ipfs://QmAlice");
        assertTrue(info.active);
        assertGt(info.registeredAt, 0);
        assertEq(info.capabilities.length, 2);
        assertEq(info.capabilities[0], "text-generation");
        assertEq(info.capabilities[1], "code-review");
    }

    function test_Update() public {
        _registerAlice();

        vm.prank(alice);
        registry.update("Alice v2", caps2, "multimodal", "https://v2.alice.example", "ipfs://QmAliceV2");

        IAgentRegistry.AgentInfo memory info = registry.getAgent(alice);

        assertEq(info.name, "Alice v2");
        assertEq(info.serviceType, "multimodal");
        assertEq(info.endpoint, "https://v2.alice.example");
        assertEq(info.metadataURI, "ipfs://QmAliceV2");
        assertEq(info.capabilities.length, 1);
        assertEq(info.capabilities[0], "image-synthesis");
    }

    function test_Deactivate() public {
        _registerAlice();

        assertTrue(registry.isActive(alice));

        vm.prank(alice);
        registry.deactivate();

        assertFalse(registry.isActive(alice));
        assertTrue(registry.isRegistered(alice));
    }

    function test_Reactivate() public {
        _registerAlice();

        vm.prank(alice);
        registry.deactivate();
        assertFalse(registry.isActive(alice));

        vm.prank(alice);
        registry.reactivate();
        assertTrue(registry.isActive(alice));
    }

    function test_GetTrustScore() public {
        trustRegistry.initWallet(alice);
        assertEq(registry.getTrustScore(alice), 100);
    }

    function test_GetTrustScore_Uninitialized() public {
        assertEq(registry.getTrustScore(address(0xDEAD)), 0);
    }

    function test_AgentCount() public {
        assertEq(registry.agentCount(), 0);

        _registerAlice();
        vm.prank(bob);
        registry.register("Bob Agent", caps1, "oracle", "https://bob.example", "ipfs://QmBob");
        vm.prank(carol);
        registry.register("Carol Agent", caps2, "compute", "https://carol.example", "ipfs://QmCarol");

        assertEq(registry.agentCount(), 3);
    }

    function test_GetAgentAtIndex() public {
        _registerAlice();
        assertEq(registry.getAgentAtIndex(0), alice);
    }

    function test_HeartbeatDefaults() public {
        _registerAlice();
        IAgentRegistry.OperationalMetrics memory ops = registry.getOperationalMetrics(alice);

        assertEq(ops.heartbeatInterval, 1 hours);
        assertEq(ops.heartbeatGracePeriod, 15 minutes);
        assertEq(ops.lastHeartbeatAt, 0);
        assertEq(ops.uptimeScore, 100);
        assertEq(ops.responseScore, 100);
    }

    function test_SubmitHeartbeatUpdatesMetrics() public {
        _registerAlice();

        vm.prank(alice);
        registry.submitHeartbeat(320);

        IAgentRegistry.OperationalMetrics memory ops = registry.getOperationalMetrics(alice);
        assertEq(ops.lastHeartbeatAt, block.timestamp);
        assertEq(ops.heartbeatCount, 1);
        assertEq(ops.rollingLatency, 320);
        assertEq(ops.responseScore, 90);
        assertEq(ops.uptimeScore, 100);
    }

    function test_MissedHeartbeatLowersUptimeScore() public {
        _registerAlice();

        vm.prank(alice);
        registry.submitHeartbeat(200);

        vm.warp(block.timestamp + 3 hours);
        IAgentRegistry.OperationalMetrics memory ops = registry.getOperationalMetrics(alice);

        assertGt(ops.missedHeartbeatCount, 0);
        assertLt(ops.uptimeScore, 100);
    }

    function test_SetHeartbeatPolicy() public {
        _registerAlice();

        vm.prank(alice);
        registry.setHeartbeatPolicy(2 hours, 10 minutes);

        IAgentRegistry.OperationalMetrics memory ops = registry.getOperationalMetrics(alice);
        assertEq(ops.heartbeatInterval, 2 hours);
        assertEq(ops.heartbeatGracePeriod, 10 minutes);
    }

    function test_RevertIfAlreadyRegistered() public {
        _registerAlice();

        vm.prank(alice);
        vm.expectRevert("AgentRegistry: already registered");
        registry.register("Alice Dup", caps1, "LLM", "", "");
    }

    function test_RevertUpdate_NotRegistered() public {
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: not registered");
        registry.update("Bob", caps1, "LLM", "", "");
    }

    function test_RevertGetAgent_NotRegistered() public {
        vm.expectRevert("AgentRegistry: not registered");
        registry.getAgent(address(0xBEEF));
    }

    function test_RevertDeactivate_AlreadyInactive() public {
        _registerAlice();

        vm.prank(alice);
        registry.deactivate();

        vm.prank(alice);
        vm.expectRevert("AgentRegistry: already inactive");
        registry.deactivate();
    }

    function test_RevertUpdate_InactiveAgent() public {
        _registerAlice();

        vm.prank(alice);
        registry.deactivate();

        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent not active");
        registry.update("Alice v2", caps1, "LLM", "", "");
    }

    function test_RevertSetHeartbeatPolicy_InvalidInterval() public {
        _registerAlice();

        vm.prank(alice);
        vm.expectRevert("AgentRegistry: invalid interval");
        registry.setHeartbeatPolicy(4 minutes, 1 minutes);
    }

    function test_IsRegistered_False() public {
        assertFalse(registry.isRegistered(address(0xBEEF)));
    }

    function test_GetCapabilities() public {
        _registerAlice();

        string[] memory caps = registry.getCapabilities(alice);
        assertEq(caps.length, 2);
        assertEq(caps[0], "text-generation");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/CapabilityRegistry.sol";
import "../contracts/AgentRegistry.sol";
import "../contracts/TrustRegistry.sol";

contract CapabilityRegistryTest is Test {
    TrustRegistry trustRegistry;
    AgentRegistry agentRegistry;
    CapabilityRegistry capabilityRegistry;

    address gov = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    string[] caps;

    function setUp() public {
        trustRegistry = new TrustRegistry();
        agentRegistry = new AgentRegistry(address(trustRegistry));
        capabilityRegistry = new CapabilityRegistry(address(agentRegistry), gov);

        caps = new string[](1);
        caps[0] = "legacy-freeform";

        vm.prank(alice);
        agentRegistry.register("Alice", caps, "LLM", "https://alice.example", "ipfs://alice");
    }

    function test_GovernanceRegistersRootsAndAgentClaimsCanonicalCapability() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");

        vm.prank(alice);
        capabilityRegistry.claim("legal.patent-analysis.us.v1");

        string[] memory aliceCaps = capabilityRegistry.getCapabilities(alice);
        assertEq(aliceCaps.length, 1);
        assertEq(aliceCaps[0], "legal.patent-analysis.us.v1");
        assertTrue(capabilityRegistry.isCapabilityClaimed(alice, "legal.patent-analysis.us.v1"));
    }

    function test_RevertIfRootInactive() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");
        vm.prank(gov);
        capabilityRegistry.setRootStatus("legal", false);

        vm.prank(alice);
        vm.expectRevert("CapabilityRegistry: root not active");
        capabilityRegistry.claim("legal.patent-analysis.us.v1");
    }

    function test_RevertIfAgentInactive() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");

        vm.prank(alice);
        agentRegistry.deactivate();

        vm.prank(alice);
        vm.expectRevert("CapabilityRegistry: inactive agent");
        capabilityRegistry.claim("legal.patent-analysis.us.v1");
    }

    function test_RevertOnInvalidCanonicalCapability() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");

        vm.startPrank(alice);
        vm.expectRevert("CapabilityRegistry: invalid capability");
        capabilityRegistry.claim("Legal.Patent.v1");

        vm.expectRevert("CapabilityRegistry: invalid capability");
        capabilityRegistry.claim("legal.patent-analysis.us");
        vm.stopPrank();
    }

    function test_RevertOnDuplicateCapability() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");

        vm.prank(alice);
        capabilityRegistry.claim("legal.patent-analysis.us.v1");

        vm.prank(alice);
        vm.expectRevert("CapabilityRegistry: already claimed");
        capabilityRegistry.claim("legal.patent-analysis.us.v1");
    }

    function test_RevokeCapability() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("legal");

        vm.prank(alice);
        capabilityRegistry.claim("legal.patent-analysis.us.v1");

        vm.prank(alice);
        capabilityRegistry.revoke("legal.patent-analysis.us.v1");

        assertFalse(capabilityRegistry.isCapabilityClaimed(alice, "legal.patent-analysis.us.v1"));
        assertEq(capabilityRegistry.capabilityCount(alice), 0);
    }

    function test_MaxCapabilitiesPerAgent() public {
        vm.prank(gov);
        capabilityRegistry.registerRoot("compute");

        for (uint256 i = 0; i < capabilityRegistry.MAX_CAPABILITIES_PER_AGENT(); i++) {
            vm.prank(alice);
            capabilityRegistry.claim(string.concat("compute.worker-", vm.toString(i), ".v1"));
        }

        vm.prank(alice);
        vm.expectRevert("CapabilityRegistry: too many capabilities");
        capabilityRegistry.claim("compute.worker-20.v1");
    }

    function test_UnknownRootRejected() public {
        vm.prank(alice);
        vm.expectRevert("CapabilityRegistry: root not active");
        capabilityRegistry.claim("insurance.claims.coverage.v1");

        assertEq(capabilityRegistry.capabilityCount(bob), 0);
    }
}

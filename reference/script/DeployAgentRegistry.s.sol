// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/AgentRegistry.sol";

/**
 * @title DeployAgentRegistry
 * @notice Deploys AgentRegistry against an existing TrustRegistry.
 *
 * Usage:
 *   TRUST_REGISTRY_ADDRESS=0x... forge script script/DeployAgentRegistry.s.sol \
 *     --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
 */
contract DeployAgentRegistry is Script {
    function run() external {
        address trustRegistryAddress = vm.envAddress("TRUST_REGISTRY_ADDRESS");
        require(trustRegistryAddress != address(0), "DeployAgentRegistry: TRUST_REGISTRY_ADDRESS not set");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        AgentRegistry agentRegistry = new AgentRegistry(trustRegistryAddress);
        console.log("AgentRegistry:    ", address(agentRegistry));
        console.log("TrustRegistry:    ", trustRegistryAddress);

        vm.stopBroadcast();

        console.log("\n=== AgentRegistry DEPLOYMENT COMPLETE ===");
        console.log("Agents can now self-register via AgentRegistry.register()");
    }
}

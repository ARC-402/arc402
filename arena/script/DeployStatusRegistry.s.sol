// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/StatusRegistry.sol";

/**
 * @title DeployStatusRegistry
 * @notice Deploys StatusRegistry to the configured chain.
 *
 * Usage:
 *   export AGENT_REGISTRY=0x<address>
 *   forge script script/DeployStatusRegistry.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 */
contract DeployStatusRegistry is Script {
    function run() external {
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        require(agentRegistry != address(0), "DeployStatusRegistry: AGENT_REGISTRY not set");

        vm.startBroadcast();
        StatusRegistry registry = new StatusRegistry(agentRegistry);
        vm.stopBroadcast();

        console2.log("StatusRegistry deployed at:", address(registry));
        console2.log("AgentRegistry wired to:    ", agentRegistry);
    }
}

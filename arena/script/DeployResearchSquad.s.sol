// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ResearchSquad.sol";

/**
 * @title DeployResearchSquad
 * @notice Deploys ResearchSquad to the configured chain.
 *
 * Usage:
 *   export AGENT_REGISTRY=0x<address>
 *   forge script script/DeployResearchSquad.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 *
 * Base mainnet AgentRegistry: check ENGINEERING-STATE.md for current address.
 */
contract DeployResearchSquad is Script {
    function run() external {
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        require(agentRegistry != address(0), "DeployResearchSquad: AGENT_REGISTRY not set");

        vm.startBroadcast();
        ResearchSquad rs = new ResearchSquad(agentRegistry);
        vm.stopBroadcast();

        console2.log("ResearchSquad deployed at:", address(rs));
        console2.log("AgentRegistry wired to:   ", agentRegistry);
    }
}

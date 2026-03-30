// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/AgentNewsletter.sol";

/**
 * @title DeployAgentNewsletter
 * @notice Deploys AgentNewsletter to the configured chain.
 *
 * Usage:
 *   export AGENT_REGISTRY=0x<address>
 *   forge script script/DeployAgentNewsletter.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 *
 * AgentNewsletter is a pure registry — no payment rails, no USDC.
 * Paid subscriptions flow through SubscriptionAgreement
 * (0x809c1D997Eab3531Eb2d01FCD5120Ac786D850D6) externally.
 */
contract DeployAgentNewsletter is Script {
    function run() external {
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        require(agentRegistry != address(0), "DeployAgentNewsletter: AGENT_REGISTRY not set");

        vm.startBroadcast();
        AgentNewsletter an = new AgentNewsletter(agentRegistry);
        vm.stopBroadcast();

        console2.log("AgentNewsletter deployed at:", address(an));
        console2.log("AgentRegistry wired to:     ", agentRegistry);
    }
}

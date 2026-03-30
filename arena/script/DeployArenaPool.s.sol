// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ArenaPool.sol";

/**
 * @title DeployArenaPool
 * @notice Deployment script for ArenaPool.
 *
 * Required environment variables:
 *   USDC_ADDRESS         — USDC token address (Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
 *   POLICY_ENGINE        — PolicyEngine contract address
 *   AGENT_REGISTRY       — AgentRegistry contract address
 *   RESOLVER             — Resolver address (protocol multisig in V1)
 *   TREASURY             — Protocol fee destination
 *   FEE_BPS              — Fee in basis points (e.g. 300 = 3%)
 *
 * Usage:
 *   forge script script/DeployArenaPool.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvvv
 */
contract DeployArenaPool is Script {
    function run() external returns (ArenaPool pool) {
        // ─── Read env vars ────────────────────────────────────────────────────

        address usdc         = vm.envAddress("USDC_ADDRESS");
        address policyEngine = vm.envAddress("POLICY_ENGINE");
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        address resolver     = vm.envAddress("RESOLVER");
        address treasury     = vm.envAddress("TREASURY");
        uint256 feeBps       = vm.envUint("FEE_BPS");

        // ─── Validation ───────────────────────────────────────────────────────

        require(usdc          != address(0), "DeployArenaPool: USDC_ADDRESS not set");
        require(policyEngine  != address(0), "DeployArenaPool: POLICY_ENGINE not set");
        require(agentRegistry != address(0), "DeployArenaPool: AGENT_REGISTRY not set");
        require(resolver      != address(0), "DeployArenaPool: RESOLVER not set");
        require(treasury      != address(0), "DeployArenaPool: TREASURY not set");
        require(feeBps        <= 1_000,      "DeployArenaPool: FEE_BPS exceeds 10%");

        // ─── Deploy ───────────────────────────────────────────────────────────

        vm.startBroadcast();

        pool = new ArenaPool(
            usdc,
            policyEngine,
            agentRegistry,
            resolver,
            treasury,
            feeBps
        );

        vm.stopBroadcast();

        // ─── Log ─────────────────────────────────────────────────────────────

        console2.log("ArenaPool deployed at:", address(pool));
        console2.log("  USDC:          ", usdc);
        console2.log("  PolicyEngine:  ", policyEngine);
        console2.log("  AgentRegistry: ", agentRegistry);
        console2.log("  Resolver:      ", resolver);
        console2.log("  Treasury:      ", treasury);
        console2.log("  Fee (bps):     ", feeBps);
    }
}

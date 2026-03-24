// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../contracts/PolicyEngine.sol";

/**
 * @title DeployPolicyEngineV2
 * @notice Deploys updated PolicyEngine contract.
 *
 * After deploy:
 *   1. Update ARC402RegistryV2 policyEngine address via update()
 *   2. Run UpdateARC402RegistryV3.s.sol to propagate to V3
 *
 * Usage:
 *   FOUNDRY_PROFILE=deploy forge script reference/script/DeployPolicyEngineV2.s.sol \
 *     --rpc-url $BASE_MAINNET_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY
 */
contract DeployPolicyEngineV2 is Script {
    function run() external {
        console2.log("=== DeployPolicyEngineV2 ===");
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast();
        PolicyEngine pe = new PolicyEngine();
        vm.stopBroadcast();

        console2.log("PolicyEngineV2:", address(pe));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update ARC402RegistryV2 - call update((policyEngine,...), version)");
        console2.log("     Pass updated policyEngine address:", address(pe));
        console2.log("     Keep all other ProtocolContracts fields from current registry state.");
        console2.log("  2. Run UpdateARC402RegistryV3.s.sol to propagate to V3");
    }
}

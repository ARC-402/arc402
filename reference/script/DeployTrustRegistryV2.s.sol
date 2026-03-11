// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/TrustRegistryV2.sol";

/**
 * @title DeployTrustRegistryV2
 * @notice Foundry deploy script for TrustRegistryV2.
 *
 * Usage:
 *   # Without v1 migration
 *   forge script script/DeployTrustRegistryV2.s.sol --broadcast --rpc-url $RPC_URL
 *
 *   # With v1 migration (lazy — reads v1 score on first wallet interaction)
 *   V1_REGISTRY=0x<address> forge script script/DeployTrustRegistryV2.s.sol --broadcast --rpc-url $RPC_URL
 *
 *   # With initial minimum agreement value (wei)
 *   V1_REGISTRY=0x<address> MIN_AGREEMENT_WEI=10000000000000000 forge script ...
 *
 * Environment variables:
 *   V1_REGISTRY          (optional) Address of deployed TrustRegistry v1
 *   MIN_AGREEMENT_WEI    (optional) Minimum agreement value in wei (0 = disabled)
 *   INITIAL_UPDATER      (optional) Additional authorized updater address (e.g. ServiceAgreement)
 */
contract DeployTrustRegistryV2 is Script {

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // Optional v1 registry for lazy migration
        address v1Registry = vm.envOr("V1_REGISTRY", address(0));

        // Optional minimum agreement value (wei); default = 0 (disabled)
        uint256 minAgreementWei = vm.envOr("MIN_AGREEMENT_WEI", uint256(0));

        // Optional additional authorized updater (e.g. ServiceAgreement contract address)
        address initialUpdater = vm.envOr("INITIAL_UPDATER", address(0));

        vm.startBroadcast(deployerKey);

        TrustRegistryV2 registry = new TrustRegistryV2(v1Registry);

        if (minAgreementWei > 0) {
            registry.setMinimumAgreementValue(minAgreementWei);
        }

        if (initialUpdater != address(0)) {
            registry.addUpdater(initialUpdater);
        }

        vm.stopBroadcast();

        console.log("TrustRegistryV2 deployed at:", address(registry));
        console.log("  v1Registry:        ", v1Registry);
        console.log("  minAgreementWei:   ", minAgreementWei);
        console.log("  initialUpdater:    ", initialUpdater);
        console.log("  owner:             ", registry.owner());
    }
}

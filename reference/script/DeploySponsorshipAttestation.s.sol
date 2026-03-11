// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/SponsorshipAttestation.sol";

/**
 * @title DeploySponsorshipAttestation
 * @notice Deploys SponsorshipAttestation — the optional opt-in agency-agent association registry.
 *
 *         This contract has no dependencies. It is protocol-neutral infrastructure.
 *         Agencies use it voluntarily to publish verifiable fleet associations.
 *         Agents that don't want public affiliation simply don't use it.
 *
 * Usage:
 *   forge script script/DeploySponsorshipAttestation.s.sol \
 *     --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
 */
contract DeploySponsorshipAttestation is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        SponsorshipAttestation sa = new SponsorshipAttestation();
        console.log("SponsorshipAttestation:", address(sa));

        vm.stopBroadcast();

        console.log("\n=== SponsorshipAttestation DEPLOYMENT COMPLETE ===");
        console.log("Usage: agencies call publish(agent, expiresAt) to opt into public association.");
        console.log("       Usage is voluntary. The protocol does not require registration.");
    }
}

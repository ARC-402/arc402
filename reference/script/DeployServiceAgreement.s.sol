// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ServiceAgreement.sol";

/**
 * @title DeployServiceAgreement
 * @notice Deploys the ServiceAgreement contract for ARC-402 bilateral agent agreements.
 *         The deployer becomes the initial owner (dispute arbiter).
 *
 * Usage:
 *   forge script script/DeployServiceAgreement.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
 */
contract DeployServiceAgreement is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        ServiceAgreement serviceAgreement = new ServiceAgreement();
        console.log("ServiceAgreement: ", address(serviceAgreement));
        console.log("Owner (arbiter):  ", serviceAgreement.owner());

        vm.stopBroadcast();

        console.log("\n=== ServiceAgreement DEPLOYMENT COMPLETE ===");
        console.log("The deployer is the initial dispute arbiter.");
        console.log("Transfer ownership to a governance module via transferOwnership().");
    }
}

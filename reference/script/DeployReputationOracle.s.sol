// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ReputationOracle.sol";

/**
 * @title DeployReputationOracle
 * @notice Deploys ReputationOracle and optionally wires it into an existing ServiceAgreement.
 *
 * Usage:
 *   TRUST_REGISTRY_ADDRESS=0x...
 *   SERVICE_AGREEMENT_ADDRESS=0x...   # optional — address(0) deploys oracle standalone
 *   SA_OWNER_KEY=0x...               # required only if SERVICE_AGREEMENT_ADDRESS is set
 *
 *   forge script script/DeployReputationOracle.s.sol \
 *     --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
 */
contract DeployReputationOracle is Script {
    function run() external {
        address trustRegistryAddress    = vm.envAddress("TRUST_REGISTRY_ADDRESS");
        address serviceAgreementAddress = vm.envOr("SERVICE_AGREEMENT_ADDRESS", address(0));

        require(trustRegistryAddress != address(0), "DeployReputationOracle: TRUST_REGISTRY_ADDRESS not set");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        ReputationOracle oracle = new ReputationOracle(
            trustRegistryAddress,
            serviceAgreementAddress
        );

        console.log("ReputationOracle: ", address(oracle));
        console.log("TrustRegistry:    ", trustRegistryAddress);
        console.log("ServiceAgreement: ", serviceAgreementAddress);

        vm.stopBroadcast();

        console.log("\n=== ReputationOracle DEPLOYMENT COMPLETE ===");
        if (serviceAgreementAddress != address(0)) {
            console.log("Next: call ServiceAgreement.setReputationOracle(oracle) as SA owner");
            console.log("      to complete the auto-WARN / auto-ENDORSE integration.");
        } else {
            console.log("Deployed standalone. Wire into ServiceAgreement via setReputationOracle().");
        }
        console.log("ENDORSE_STREAK_THRESHOLD:", oracle.ENDORSE_STREAK_THRESHOLD());
    }
}

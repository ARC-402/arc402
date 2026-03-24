// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../contracts/src/ARC402RegistryV3.sol";

// ─── Minimal V2 interface to read existing addresses ─────────────────────────

interface IV2Registry {
    function policyEngine()          external view returns (address);
    function trustRegistry()         external view returns (address);
    function intentAttestation()     external view returns (address);
    function serviceAgreement()      external view returns (address);
    function sessionChannels()       external view returns (address);
    function agentRegistry()         external view returns (address);
    function reputationOracle()      external view returns (address);
    function settlementCoordinator() external view returns (address);
    function vouchingRegistry()      external view returns (address);
    function migrationRegistry()     external view returns (address);
    function version()               external view returns (string memory);
}

/**
 * @title DeployARC402RegistryV3
 * @notice Forge deployment script for ARC402RegistryV3.
 *
 *  Reads current V2 addresses from the live ARC402RegistryV2 at:
 *    0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622 (Base Mainnet)
 *
 *  and populates V3 with all V2 fields plus the new compute/subscription addresses.
 *
 *  Usage:
 *    forge script script/DeployARC402RegistryV3.s.sol \
 *      --rpc-url $BASE_MAINNET_RPC \
 *      --private-key $PRIVATE_KEY \
 *      --broadcast \
 *      --verify \
 *      --etherscan-api-key $BASESCAN_API_KEY
 *
 *  Environment variables:
 *    BASE_MAINNET_RPC     — RPC endpoint (e.g. Alchemy Base Mainnet)
 *    PRIVATE_KEY          — Deployer private key (hex, 0x-prefixed)
 *    BASESCAN_API_KEY     — For contract verification on Basescan
 *
 *    Optional overrides (defaults to the known mainnet addresses):
 *    COMPUTE_AGREEMENT       — ComputeAgreement address
 *    SUBSCRIPTION_AGREEMENT  — SubscriptionAgreement address
 *    DISPUTE_ARBITRATION     — DisputeArbitration address
 *    DISPUTE_MODULE          — DisputeModule address
 *    REGISTRY_VERSION        — Version string (default: "v3.0.0")
 *
 *  Post-deploy:
 *    1. Verify all addresses in the deployed registry via getContracts().
 *    2. Set any extension addresses via setExtension(key, addr).
 *    3. Update NETWORK_DEFAULTS in cli/src/config.ts with the new V3 address.
 *    4. Update ARC402_REGISTRY_V3_ADDRESS in reference/sdk/src/index.ts.
 *    5. Update OnboardContent.tsx to point new wallets at V3.
 *    6. Transfer ownership to a multi-sig via transferOwnership + acceptOwnership.
 */
contract DeployARC402RegistryV3 is Script {

    // ─── Known V2 Registry ────────────────────────────────────────────────────

    address constant V2_REGISTRY = 0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622;

    // ─── Known V3 new-field defaults ──────────────────────────────────────────

    address constant DEFAULT_COMPUTE_AGREEMENT      = 0x0e06afE90aAD3e0D91e217C46d98F049C2528AF7;
    address constant DEFAULT_SUBSCRIPTION_AGREEMENT = 0xe1b6D3d0890E09582166EB450a78F6bff038CE5A;
    address constant DEFAULT_DISPUTE_ARBITRATION    = 0xF61b75E4903fbC81169FeF8b7787C13cB7750601;
    address constant DEFAULT_DISPUTE_MODULE         = 0x5ebd301cEF0C908AB17Fd183aD9c274E4B34e9d6;
    address constant DEFAULT_POLICY_ENGINE_OVERRIDE = 0x0743ab6a7280b416D3b75c7e5457390906312139; // new PE with closeContext
    address constant HANDSHAKE_CONTRACT             = 0x4F5A38Bb746d7E5d49d8fd26CA6beD141Ec2DDb3;

    function run() external {
        IV2Registry v2 = IV2Registry(V2_REGISTRY);

        // Read all V2 fields from the live registry
        address policyEngine          = vm.envOr("POLICY_ENGINE_OVERRIDE", DEFAULT_POLICY_ENGINE_OVERRIDE);
        address trustRegistry         = v2.trustRegistry();
        address intentAttestation     = v2.intentAttestation();
        address settlementCoordinator = v2.settlementCoordinator();
        address serviceAgreement      = v2.serviceAgreement();
        address sessionChannels       = v2.sessionChannels();
        address agentRegistry         = v2.agentRegistry();
        address reputationOracle      = v2.reputationOracle();
        address vouchingRegistry      = v2.vouchingRegistry();
        address migrationRegistry     = v2.migrationRegistry();

        // V3 new fields — use env overrides or fall back to known mainnet addresses
        address computeAgreement      = vm.envOr("COMPUTE_AGREEMENT",      DEFAULT_COMPUTE_AGREEMENT);
        address subscriptionAgreement = vm.envOr("SUBSCRIPTION_AGREEMENT", DEFAULT_SUBSCRIPTION_AGREEMENT);
        address disputeArbitration    = vm.envOr("DISPUTE_ARBITRATION",    DEFAULT_DISPUTE_ARBITRATION);
        address disputeModule         = vm.envOr("DISPUTE_MODULE",         DEFAULT_DISPUTE_MODULE);
        string  memory ver            = vm.envOr("REGISTRY_VERSION",       string("v3.0.0"));

        console2.log("=== ARC402RegistryV3 Deployment ===");
        console2.log("Reading V2 registry at:", V2_REGISTRY);
        console2.log("  policyEngine:          ", policyEngine);
        console2.log("  trustRegistry:         ", trustRegistry);
        console2.log("  intentAttestation:     ", intentAttestation);
        console2.log("  settlementCoordinator: ", settlementCoordinator);
        console2.log("  serviceAgreement:      ", serviceAgreement);
        console2.log("  sessionChannels:       ", sessionChannels);
        console2.log("  agentRegistry:         ", agentRegistry);
        console2.log("  reputationOracle:      ", reputationOracle);
        console2.log("  vouchingRegistry:      ", vouchingRegistry);
        console2.log("  migrationRegistry:     ", migrationRegistry);
        console2.log("V3 new fields:");
        console2.log("  computeAgreement:      ", computeAgreement);
        console2.log("  subscriptionAgreement: ", subscriptionAgreement);
        console2.log("  disputeArbitration:    ", disputeArbitration);
        console2.log("  disputeModule:         ", disputeModule);
        console2.log("  version:               ", ver);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast();

        ARC402RegistryV3 v3 = new ARC402RegistryV3(
            policyEngine,
            trustRegistry,
            intentAttestation,
            settlementCoordinator,
            serviceAgreement,
            sessionChannels,
            agentRegistry,
            reputationOracle,
            vouchingRegistry,
            migrationRegistry,
            computeAgreement,
            subscriptionAgreement,
            disputeArbitration,
            disputeModule,
            ver
        );

        // Set handshake extension
        bytes32 handshakeKey = keccak256("handshake");
        v3.setExtension(handshakeKey, HANDSHAKE_CONTRACT);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployed ===");
        console2.log("ARC402RegistryV3:", address(v3));
        console2.log("Owner (deployer):", v3.owner());
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update cli/src/config.ts arc402RegistryV3Address with:", address(v3));
        console2.log("  2. Update reference/sdk/src/index.ts ARC402_REGISTRY_V3_ADDRESS with:", address(v3));
        console2.log("  3. Update web/app/onboard/OnboardContent.tsx ARC402_REGISTRY_V3 with:", address(v3));
        console2.log("  4. Transfer ownership: v3.transferOwnership(<multisig>)");
    }
}

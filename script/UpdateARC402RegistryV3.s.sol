// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";

interface IARC402RegistryV3 {
    struct ProtocolContracts {
        address policyEngine;
        address trustRegistry;
        address intentAttestation;
        address serviceAgreement;
        address sessionChannels;
        address agentRegistry;
        address reputationOracle;
        address settlementCoordinator;
        address vouchingRegistry;
        address migrationRegistry;
        address computeAgreement;
        address subscriptionAgreement;
        address disputeArbitration;
        address disputeModule;
    }
    function update(ProtocolContracts calldata contracts, string calldata version) external;
    function setExtension(bytes32 key, address addr) external;
    function policyEngine() external view returns (address);
}

/**
 * @title UpdateARC402RegistryV3
 * @notice Corrects the scrambled addresses in the existing ARC402RegistryV3 deployment.
 *
 * Current issues in deployed V3 (0x6eafed4fa103d2de04ddee157e35a8e8df91b6a6):
 *   - policyEngine: old PE (pre-closeContext) → needs new PE
 *   - serviceAgreement: points at SettlementCoordinator (address shift bug)
 *   - sessionChannels, agentRegistry, reputationOracle, settlementCoordinator: all shifted
 *   - disputeArbitration, disputeModule: address(0) → need active addresses
 *   - handshake extension: not set
 *
 * All correct addresses sourced from ARC402RegistryV2 (0xcc0D87...) + known deployed contracts.
 *
 * Usage:
 *   FOUNDRY_PROFILE=deploy forge script script/UpdateARC402RegistryV3.s.sol \
 *     --rpc-url $BASE_MAINNET_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify
 */
contract UpdateARC402RegistryV3 is Script {

    // Registry to update
    address constant REGISTRY_V3 = 0x6EafeD4FA103D2De04DDee157e35A8e8df91B6A6;

    // All correct addresses (verified from V2 registry + known deployed contracts)
    address constant POLICY_ENGINE          = 0x9449B15268bE7042C0b473F3f711a41A29220866; // new PE with closeContext
    address constant TRUST_REGISTRY         = 0x22366D6dabb03062Bc0a5E893EfDff15D8E329b1; // TrustRegistryV3
    address constant INTENT_ATTESTATION     = 0x66585C2F96cAe05EA360F6dBF76bA092A7B87669;
    address constant SERVICE_AGREEMENT      = 0xC98B402CAB9156da68A87a69E3B4bf167A3CCcF6; // active SA
    address constant SESSION_CHANNELS       = 0x578f8d1bd82E8D6268E329d664d663B4d985BE61; // active
    address constant AGENT_REGISTRY         = 0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865;
    address constant REPUTATION_ORACLE      = 0x359F76a54F9A345546E430e4d6665A7dC9DaECd4;
    address constant SETTLEMENT_COORDINATOR = 0xd52d8Be9728976E0D70C89db9F8ACeb5B5e97cA2;
    address constant VOUCHING_REGISTRY      = 0x94519194Bf17865770faD59eF581feC512Ae99c9;
    address constant MIGRATION_REGISTRY     = 0x4821D8A590eD4DbEf114fCA3C2d9311e81D576DF;
    address constant COMPUTE_AGREEMENT      = 0xf898A8A2cF9900A588B174d9f96349BBA95e57F3; // fee-enabled (15 bps)
    address constant SUBSCRIPTION_AGREEMENT = 0x809c1D997Eab3531Eb2d01FCD5120Ac786D850D6; // fee-enabled (20 bps)
    address constant DISPUTE_ARBITRATION    = 0xF61b75E4903fbC81169FeF8b7787C13cB7750601; // active
    address constant DISPUTE_MODULE         = 0x5ebd301cEF0C908AB17Fd183aD9c274E4B34e9d6; // active
    address constant HANDSHAKE              = 0x4F5A38Bb746d7E5d49d8fd26CA6beD141Ec2DDb3;

    function run() external {
        IARC402RegistryV3 v3 = IARC402RegistryV3(REGISTRY_V3);

        console2.log("=== ARC402RegistryV3 Update ===");
        console2.log("Registry:", REGISTRY_V3);
        console2.log("Current policyEngine:", v3.policyEngine());
        console2.log("New policyEngine:    ", POLICY_ENGINE);

        vm.startBroadcast();

        v3.update(
            IARC402RegistryV3.ProtocolContracts({
                policyEngine:          POLICY_ENGINE,
                trustRegistry:         TRUST_REGISTRY,
                intentAttestation:     INTENT_ATTESTATION,
                serviceAgreement:      SERVICE_AGREEMENT,
                sessionChannels:       SESSION_CHANNELS,
                agentRegistry:         AGENT_REGISTRY,
                reputationOracle:      REPUTATION_ORACLE,
                settlementCoordinator: SETTLEMENT_COORDINATOR,
                vouchingRegistry:      VOUCHING_REGISTRY,
                migrationRegistry:     MIGRATION_REGISTRY,
                computeAgreement:      COMPUTE_AGREEMENT,
                subscriptionAgreement: SUBSCRIPTION_AGREEMENT,
                disputeArbitration:    DISPUTE_ARBITRATION,
                disputeModule:         DISPUTE_MODULE
            }),
            "v3.1.0"
        );

        // Set handshake extension
        v3.setExtension(keccak256("handshake"), HANDSHAKE);

        vm.stopBroadcast();

        console2.log("=== Update complete ===");
        console2.log("New policyEngine:", v3.policyEngine());
        console2.log("Version: v3.1.0");
        console2.log("Handshake extension set:", HANDSHAKE);
    }
}

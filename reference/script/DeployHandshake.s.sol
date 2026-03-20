// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ARC402RegistryV3.sol";
import "../contracts/Handshake.sol";

/**
 * @title DeployHandshake
 * @notice Deploy script for Handshake + ARC402RegistryV3 on Base mainnet.
 *
 * Usage:
 *   forge script script/DeployHandshake.s.sol:DeployHandshake \
 *     --rpc-url https://mainnet.base.org \
 *     --private-key $DEPLOYER_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_KEY
 *
 * Deployment sequence:
 *   1. Deploy ARC402RegistryV3 (with all existing V2 addresses + handshake = address(0))
 *   2. Deploy Handshake contract
 *   3. Allow USDC on Handshake
 *   4. Update RegistryV3 to include Handshake address
 *
 * After deployment:
 *   - Wallet owner calls proposeRegistryUpdate(registryV3Address)
 *   - Wait 2-day timelock
 *   - Wallet owner calls executeRegistryUpdate()
 *   - Send first handshake
 */
contract DeployHandshake is Script {
    // ─── Base mainnet addresses (from existing V2 deployment) ─────────────

    // Base mainnet addresses — from ARC402RegistryV2 (0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622)
    //
    // BEFORE DEPLOYING: Verify these are current by running:
    //   cast call 0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622 "getContracts()" --rpc-url https://mainnet.base.org
    // The registry may have been updated since these were recorded.

    address constant POLICY_ENGINE          = 0xAA5Ef3489C929bFB3BFf5D5FE15aa62d3763c847;
    address constant TRUST_REGISTRY         = 0x22366D6dabb03062Bc0a5E893EfDff15D8E329b1; // TrustRegistryV3
    address constant INTENT_ATTESTATION     = 0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460;
    address constant SERVICE_AGREEMENT      = 0xC98B402CAB9156da68A87a69E3B4bf167A3CCcF6;
    address constant SESSION_CHANNELS       = 0x578f8d1bd82E8D6268E329d664d663B4d985BE61;
    address constant AGENT_REGISTRY         = 0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865;
    address constant REPUTATION_ORACLE      = 0x359F76a54F9A345546E430e4d6665A7dC9DaECd4;
    address constant SETTLEMENT_COORDINATOR = 0x6653F385F98752575db3180b9306e2d9644f9Eb1; // Verify if V2 is active
    address constant VOUCHING_REGISTRY      = 0x94519194Bf17865770faD59eF581feC512Ae99c9;
    address constant MIGRATION_REGISTRY     = 0xb60B62357b90F254f555f03B162a30E22890e3B5;

    // Base mainnet USDC
    address constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy ARC402RegistryV3
        ARC402RegistryV3 registryV3 = new ARC402RegistryV3(
            POLICY_ENGINE,
            TRUST_REGISTRY,
            INTENT_ATTESTATION,
            SETTLEMENT_COORDINATOR,
            "v3.0.0-handshake"
        );

        // 2. Deploy Handshake
        Handshake handshake = new Handshake();

        // 3. Allow USDC on Handshake
        handshake.setAllowedToken(USDC_BASE, true);

        // 4. Update RegistryV3 with all addresses including Handshake
        registryV3.update(
            ARC402RegistryV3.ProtocolContracts({
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
                handshake:             address(handshake)
            }),
            "v3.0.0-handshake"
        );

        vm.stopBroadcast();

        // Log deployed addresses
        console.log("=== Deployment Complete ===");
        console.log("ARC402RegistryV3:", address(registryV3));
        console.log("Handshake:       ", address(handshake));
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Verify contracts on Basescan");
        console.log("2. From your agent wallet, call:");
        console.log("   proposeRegistryUpdate(", address(registryV3), ")");
        console.log("3. Wait 2 days");
        console.log("4. Call executeRegistryUpdate()");
        console.log("5. Send first handshake!");
    }
}

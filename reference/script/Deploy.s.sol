// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";
import "../contracts/WalletFactory.sol";

/**
 * @title ARC-402 Canonical Deployment
 * @notice Deploys the 4 shared infrastructure contracts.
 *         Users deploy only ARC402Wallet pointing to these addresses.
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Policy Engine — stores per-wallet spending rules
        PolicyEngine policyEngine = new PolicyEngine();
        console.log("PolicyEngine:          ", address(policyEngine));

        // 2. Trust Registry — stores on-chain trust scores
        TrustRegistry trustRegistry = new TrustRegistry();
        console.log("TrustRegistry:         ", address(trustRegistry));

        // 3. Intent Attestation — permanent on-chain WHY ledger
        IntentAttestation intentAttestation = new IntentAttestation();
        console.log("IntentAttestation:     ", address(intentAttestation));

        // 4. Settlement Coordinator — bilateral agent-to-agent settlement
        SettlementCoordinator settlementCoordinator = new SettlementCoordinator();
        console.log("SettlementCoordinator: ", address(settlementCoordinator));

        // 5. Wallet Factory — pre-wired to canonical infrastructure
        WalletFactory walletFactory = new WalletFactory(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator)
        );
        console.log("WalletFactory:         ", address(walletFactory));

        vm.stopBroadcast();

        console.log("\n=== ARC-402 CANONICAL DEPLOYMENT COMPLETE ===");
        console.log("Chain: Base Sepolia (84532)");
        console.log("Save these addresses. Users point their ARC402Wallet at them.");
    }
}

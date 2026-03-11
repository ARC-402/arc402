// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../contracts/PolicyEngine.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/IntentAttestation.sol";
import "../contracts/SettlementCoordinator.sol";
import "../contracts/ARC402Registry.sol";
import "../contracts/WalletFactory.sol";

/**
 * @title ARC-402 Canonical Deployment
 * @notice Deploys the 4 shared infrastructure contracts, a registry, and a factory.
 *         Wallet owners opt into upgrades by pointing their wallet at a new registry.
 *         Nobody can force a wallet upgrade.
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

        // 5. Registry — canonical pointer to all infrastructure addresses
        ARC402Registry arc402Registry = new ARC402Registry(
            address(policyEngine),
            address(trustRegistry),
            address(intentAttestation),
            address(settlementCoordinator),
            "v1.0.0"
        );
        console.log("ARC402Registry:        ", address(arc402Registry));

        // 6. Wallet Factory — pre-wired to canonical registry
        WalletFactory walletFactory = new WalletFactory(address(arc402Registry));
        console.log("WalletFactory:         ", address(walletFactory));

        vm.stopBroadcast();

        console.log("\n=== ARC-402 CANONICAL DEPLOYMENT COMPLETE ===");
        console.log("Chain: Base Sepolia (84532)");
        console.log("Registry version: v1.0.0");
        console.log("Save these addresses. Users point their ARC402Wallet at the registry.");
        console.log("Wallet owners upgrade by calling wallet.setRegistry(newRegistry).");
        console.log("\nERC-20 / x402 support included:");
        console.log("  - ARC402Wallet.executeTokenSpend() for governed USDC payments");
        console.log("  - SettlementCoordinator supports ERC-20 bilateral settlement");
        console.log("  - Deploy X402Interceptor separately with arc402Wallet + USDC address");
        console.log("  Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e");
        console.log("  Base Mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    }
}

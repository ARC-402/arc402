// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../contracts/src/ComputeAgreement.sol";

/**
 * @title DeployComputeAgreement
 * @notice Forge deployment script for ComputeAgreement.
 *
 *  Target: Base Sepolia (chain ID 84532)
 *  Deployer becomes the owner — transfer ownership to a multi-sig post-deploy.
 *
 *  Usage:
 *    forge script script/DeployComputeAgreement.s.sol \
 *      --rpc-url $BASE_SEPOLIA_RPC \
 *      --private-key $PRIVATE_KEY \
 *      --broadcast \
 *      --verify \
 *      --etherscan-api-key $BASESCAN_API_KEY
 *
 *  Environment variables:
 *    BASE_SEPOLIA_RPC        — RPC endpoint (e.g. Alchemy/Infura Base Sepolia)
 *    PRIVATE_KEY             — Deployer private key (hex, 0x-prefixed)
 *    DISPUTE_ARBITRATION     — Optional: DisputeArbitration contract address
 *    BASESCAN_API_KEY        — For contract verification on Basescan
 *
 *  Post-deploy:
 *    1. Call setDisputeArbitration(DISPUTE_ARBITRATION) if DA is available.
 *    2. Call setArbitratorApproval(arbitrator, true) for each trusted arbitrator.
 *    3. Transfer ownership to a multi-sig via transferOwnership + acceptOwnership.
 *
 *  USDC on Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
 *  USDC on Base Sepolia: use a mock or the official testnet faucet token.
 */
contract DeployComputeAgreement is Script {
    function run() external {
        vm.startBroadcast();

        ComputeAgreement ca = new ComputeAgreement();

        // Optionally wire DisputeArbitration if address is provided
        address da = vm.envOr("DISPUTE_ARBITRATION", address(0));
        if (da != address(0)) {
            ca.setDisputeArbitration(da);
        }

        vm.stopBroadcast();

        console2.log("ComputeAgreement deployed at:", address(ca));
        console2.log("Owner (deployer):", ca.owner());
        if (da != address(0)) {
            console2.log("DisputeArbitration:", da);
        }
        console2.log("Chain ID:", block.chainid);
    }
}

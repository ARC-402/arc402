// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402Wallet.sol";
import "./ITrustRegistry.sol";

/**
 * @title ARC402WalletFactory
 * @notice Deploys ARC402Wallets pre-wired to the canonical infrastructure.
 *         Users call createWallet() instead of deploying manually.
 */
contract WalletFactory {
    address public immutable policyEngine;
    address public immutable trustRegistry;
    address public immutable intentAttestation;
    address public immutable settlementCoordinator;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletCreated(address indexed owner, address indexed walletAddress);

    constructor(
        address _policyEngine,
        address _trustRegistry,
        address _intentAttestation,
        address _settlementCoordinator
    ) {
        policyEngine = _policyEngine;
        trustRegistry = _trustRegistry;
        intentAttestation = _intentAttestation;
        settlementCoordinator = _settlementCoordinator;
    }

    function createWallet() external returns (address) {
        ARC402Wallet wallet = new ARC402Wallet(
            policyEngine,
            trustRegistry,
            intentAttestation
        );
        // ARC402Wallet constructor already calls initWallet; this is idempotent
        ITrustRegistry(trustRegistry).initWallet(address(wallet));

        ownerWallets[msg.sender].push(address(wallet));
        allWallets.push(address(wallet));

        emit WalletCreated(msg.sender, address(wallet));
        return address(wallet);
    }

    function getWallets(address owner) external view returns (address[] memory) {
        return ownerWallets[owner];
    }

    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }
}

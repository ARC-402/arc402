// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402Wallet.sol";
import "./ARC402RegistryV2.sol";
import "./ITrustRegistry.sol";

/**
 * @title ARC402WalletFactory
 * @notice Deploys ARC402Wallets pre-wired to the canonical infrastructure via a registry.
 *         Users call createWallet(entryPoint) instead of deploying manually.
 */
contract WalletFactory {
    /// @notice Base mainnet ERC-4337 v0.7 EntryPoint.
    address public constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    address public immutable registry;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletCreated(address indexed owner, address indexed walletAddress);

    constructor(address _registry) {
        require(_registry != address(0), "WalletFactory: zero registry");
        registry = _registry;
    }

    // wake-disable-next-line reentrancy
    // @dev Called only from nonReentrant-guarded entry points. Reentrancy path blocked upstream.
    /**
     * @notice Deploy a new ARC402Wallet for the caller.
     * @param _entryPoint ERC-4337 EntryPoint address. Pass address(0) to use the Base mainnet default.
     */
    function createWallet(address _entryPoint) external returns (address) {
        address ep = _entryPoint == address(0) ? DEFAULT_ENTRY_POINT : _entryPoint;
        ARC402Wallet wallet = new ARC402Wallet(registry, msg.sender, ep);
        // ARC402Wallet constructor already calls initWallet; this is idempotent
        ARC402RegistryV2 reg = ARC402RegistryV2(registry);
        ITrustRegistry(reg.trustRegistry()).initWallet(address(wallet));

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

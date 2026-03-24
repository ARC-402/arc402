// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402Wallet.v6-draft.sol";

/**
 * @title WalletFactoryV6
 * @notice Direct-deploy factory for ARC402Wallet v6.
 *
 * V6 wallet bytecode is 20,465 bytes — under the EIP-170 24,576-byte limit.
 * No code-oracle (SSTORE2/EXTCODECOPY) pattern is needed. Wallets are deployed
 * directly via `new ARC402Wallet(registry, owner, entryPoint)`.
 *
 * Compared to WalletFactoryV5:
 *   - No oracle contract required — simpler deployment, fewer moving parts
 *   - `deployWallet(address owner)` is the primary entry point
 *   - Registry and EntryPoint are set at construction time (immutable)
 *   - Event name changed to WalletDeployed (from WalletCreated) for clarity
 */
contract WalletFactoryV6 {
    /// @notice Base mainnet ERC-4337 v0.7 EntryPoint.
    address public constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    address public immutable registry;
    address public immutable entryPoint;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletDeployed(address indexed wallet, address indexed owner);

    constructor(address _registry, address _entryPoint) {
        require(_registry   != address(0), "WalletFactoryV6: zero registry");
        require(_entryPoint != address(0), "WalletFactoryV6: zero entryPoint");
        registry   = _registry;
        entryPoint = _entryPoint;
    }

    /**
     * @notice Deploy a new ARC402Wallet for the caller.
     * @return wallet The address of the newly deployed wallet.
     */
    function deployWallet() external returns (address wallet) {
        return _deploy(msg.sender);
    }

    /**
     * @notice Deploy a new ARC402Wallet for an explicit owner address.
     * @param owner The address that will own the deployed wallet.
     * @return wallet The address of the newly deployed wallet.
     */
    function deployWallet(address owner) external returns (address wallet) {
        require(owner != address(0), "WalletFactoryV6: zero owner");
        return _deploy(owner);
    }

    /// @dev Core deploy logic — direct `new` deploy, no oracle needed (V6 < 24,576 bytes).
    function _deploy(address owner) internal returns (address wallet) {
        ARC402Wallet w = new ARC402Wallet(registry, owner, entryPoint);
        wallet = address(w);

        ownerWallets[owner].push(wallet);
        allWallets.push(wallet);
        emit WalletDeployed(wallet, owner);
    }

    /// @notice Return all wallets deployed for a given owner.
    function getWallets(address owner) external view returns (address[] memory) {
        return ownerWallets[owner];
    }

    /// @notice Total number of wallets deployed by this factory.
    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }
}

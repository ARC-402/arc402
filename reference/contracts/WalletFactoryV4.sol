// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402RegistryV2.sol";
import "./ITrustRegistry.sol";

/**
 * @title WalletFactoryV4
 * @notice ERC-4337-enabled ARC402Wallet factory using the code-oracle pattern.
 *         Deploys passkey P256-enabled ARC402Wallets (Spec-33).
 *
 * Problem: ARC402Wallet creation code exceeds the EIP-170 24,576-byte limit for
 *          direct embedding via `new ARC402Wallet(...)`.
 *
 * Solution (code-oracle): Deploy a separate oracle contract whose RUNTIME CODE
 *          equals the ARC402Wallet creation code. The factory reads this via
 *          EXTCODECOPY at wallet-deploy time. The factory itself stays lean (~4 KB).
 *
 * Deployment flow (handled by script/DeployWalletFactoryV4.s.sol):
 *   1. Deploy code oracle — runtime = ARC402Wallet creation code (passkey-enabled)
 *   2. Deploy WalletFactoryV4(registry, oracle)
 *
 * Interface is identical to WalletFactoryV3 (createWallet / getWallets / totalWallets).
 */
contract WalletFactoryV4 {
    /// @notice Base mainnet / Base Sepolia ERC-4337 v0.7 EntryPoint.
    address public constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    address public immutable registry;

    /// @notice Oracle whose runtime code = ARC402Wallet (passkey v4) creation code.
    address public immutable oracle;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletCreated(address indexed owner, address indexed walletAddress);

    constructor(address _registry, address _oracle) {
        require(_registry != address(0), "WalletFactoryV4: zero registry");
        require(_oracle  != address(0), "WalletFactoryV4: zero oracle");
        registry = _registry;
        oracle   = _oracle;
    }

    // wake-disable-next-line reentrancy
    /**
     * @notice Deploy a new passkey-enabled ARC402Wallet for the caller.
     * @param _entryPoint ERC-4337 EntryPoint address. Pass address(0) to use the default.
     */
    function createWallet(address _entryPoint) external returns (address wallet) {
        address ep = _entryPoint == address(0) ? DEFAULT_ENTRY_POINT : _entryPoint;

        // Read ARC402Wallet creation code from the oracle
        bytes memory walletCreationCode = _readOracle();

        // Concatenate creation code + constructor args
        bytes memory initCode = abi.encodePacked(
            walletCreationCode,
            abi.encode(registry, msg.sender, ep)
        );

        // Deploy via CREATE
        assembly {
            wallet := create(0, add(initCode, 0x20), mload(initCode))
            if iszero(wallet) { revert(0, 0) }
        }

        // Initialize trust registry for the new wallet
        ARC402RegistryV2 reg = ARC402RegistryV2(registry);
        ITrustRegistry(reg.trustRegistry()).initWallet(wallet);

        // Register wallet
        ownerWallets[msg.sender].push(wallet);
        allWallets.push(wallet);
        emit WalletCreated(msg.sender, wallet);
    }

    /// @dev Read the ARC402Wallet creation code from the oracle via EXTCODECOPY.
    function _readOracle() internal view returns (bytes memory data) {
        address oracleAddr = oracle; // cache immutable for assembly access
        uint256 size = oracleAddr.code.length;
        data = new bytes(size);
        assembly {
            extcodecopy(oracleAddr, add(data, 32), 0, size)
        }
    }

    function getWallets(address owner) external view returns (address[] memory) {
        return ownerWallets[owner];
    }

    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }
}

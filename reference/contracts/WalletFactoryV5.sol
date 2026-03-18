// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402RegistryV2.sol";
// ITrustRegistry import removed (F-10): initWallet call was redundant and is now removed.

/**
 * @title WalletFactoryV5
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
 * Deployment flow (handled by script/DeployWalletFactoryV5.s.sol):
 *   1. Deploy code oracle — runtime = ARC402Wallet creation code (passkey-enabled)
 *   2. Deploy WalletFactoryV5(registry, oracle)
 *
 * Interface is identical to WalletFactoryV3 (createWallet / getWallets / totalWallets).
 */
contract WalletFactoryV5 {
    /// @notice Base mainnet / Base Sepolia ERC-4337 v0.7 EntryPoint.
    address public constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    address public immutable registry;

    /// @notice Oracle whose runtime code = ARC402Wallet (passkey v5) creation code.
    address public immutable oracle;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletCreated(address indexed owner, address indexed walletAddress);

    constructor(address _registry, address _oracle) {
        require(_registry != address(0), "WalletFactoryV5: zero registry");
        require(_oracle  != address(0), "WalletFactoryV5: zero oracle");
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

        // F-15 KNOWN LIMITATION: Deploy via CREATE (not CREATE2).
        // CREATE addresses depend on (factory address, factory nonce) and cannot be predicted
        // before deployment. This prevents ERC-4337 counterfactual wallet deployment where
        // users pre-fund a wallet address before it exists. A future WalletFactoryV5 can add
        // CREATE2 support via a salt parameter:
        //   bytes32 salt = keccak256(abi.encode(msg.sender, ep));
        //   wallet := create2(0, add(initCode, 0x20), mload(initCode), salt)
        // No security impact — wallets must simply be deployed before receiving funds.
        assembly {
            wallet := create(0, add(initCode, 0x20), mload(initCode))
            if iszero(wallet) { revert(0, 0) }
        }

        // F-10: Removed redundant initWallet call. ARC402Wallet constructor already calls
        // _trustRegistry().initWallet(address(this)) during deployment. Calling it again here
        // wastes ~5,000 gas and is a maintenance hazard if initWallet ever becomes non-idempotent.

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

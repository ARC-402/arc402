// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ARC402RegistryV2.sol";
import "./ITrustRegistry.sol";

/**
 * @title WalletFactoryV3
 * @notice ERC-4337-enabled ARC402Wallet factory using SSTORE2 split-chunk pattern.
 *
 * Problem: ARC402Wallet creation code is 26,558 bytes — exceeds the EIP-170
 *          24,576-byte limit for a single contract. Embedding via `new ARC402Wallet(...)`
 *          would also push the factory over the limit.
 *
 * Solution: Split the creation code into two chunk contracts (each under 24KB).
 *           At deploy time, read both chunks via EXTCODECOPY, concatenate them,
 *           append constructor args, and deploy via CREATE.
 *
 * Deployment flow (handled by script/deploy-factory-v3-chunks.js):
 *   1. Deploy chunk1 — runtime = first 24000 bytes of ARC402Wallet creation code
 *   2. Deploy chunk2 — runtime = remaining bytes
 *   3. Deploy WalletFactoryV3(registry, chunk1, chunk2)
 *
 * Interface is identical to WalletFactory v2 (createWallet / getWallets / totalWallets).
 */
contract WalletFactoryV3 {
    /// @notice Base mainnet / Base Sepolia ERC-4337 v0.7 EntryPoint.
    address public constant DEFAULT_ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    address public immutable registry;

    /// @notice First chunk of ARC402Wallet creation code (first 24000 bytes).
    address public immutable chunk1;

    /// @notice Second chunk of ARC402Wallet creation code (remaining bytes).
    address public immutable chunk2;

    mapping(address => address[]) public ownerWallets;
    address[] public allWallets;

    event WalletCreated(address indexed owner, address indexed walletAddress);

    constructor(address _registry, address _chunk1, address _chunk2) {
        require(_registry != address(0), "WalletFactoryV3: zero registry");
        require(_chunk1 != address(0), "WalletFactoryV3: zero chunk1");
        require(_chunk2 != address(0), "WalletFactoryV3: zero chunk2");
        registry = _registry;
        chunk1 = _chunk1;
        chunk2 = _chunk2;
    }

    // wake-disable-next-line reentrancy
    /**
     * @notice Deploy a new ARC402Wallet for the caller.
     * @param _entryPoint ERC-4337 EntryPoint address. Pass address(0) to use the default.
     */
    function createWallet(address _entryPoint) external returns (address wallet) {
        address ep = _entryPoint == address(0) ? DEFAULT_ENTRY_POINT : _entryPoint;

        // Read both chunks
        bytes memory code1 = _readChunk(chunk1);
        bytes memory code2 = _readChunk(chunk2);

        // Concatenate creation code + constructor args
        bytes memory initCode = abi.encodePacked(code1, code2, abi.encode(registry, msg.sender, ep));

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

    /// @dev Read the runtime code of a chunk contract via EXTCODECOPY.
    function _readChunk(address chunkAddr) internal view returns (bytes memory data) {
        uint256 size = chunkAddr.code.length;
        data = new bytes(size);
        assembly {
            extcodecopy(chunkAddr, add(data, 32), 0, size)
        }
    }

    function getWallets(address owner) external view returns (address[] memory) {
        return ownerWallets[owner];
    }

    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }
}

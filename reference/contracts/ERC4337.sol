// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice ERC-4337 v0.7 types and interfaces.
 *         Inlined to avoid external dependency on @account-abstraction/contracts.
 *         Compatible with EntryPoint v0.7: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 */

/// @notice Packed user operation struct (ERC-4337 v0.7)
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes   initCode;
    bytes   callData;
    bytes32 accountGasLimits;   // verificationGasLimit (upper 16 bytes) | callGasLimit (lower 16 bytes)
    uint256 preVerificationGas;
    bytes32 gasFees;            // maxPriorityFeePerGas (upper 16 bytes) | maxFeePerGas (lower 16 bytes)
    bytes   paymasterAndData;
    bytes   signature;
}

/// @notice ERC-4337 IAccount interface (v0.7)
interface IAccount {
    /**
     * @notice Validate user's signature and nonce.
     *         The EntryPoint calls this before executing the user operation.
     * @param userOp       The operation to validate.
     * @param userOpHash   Hash of the request, to check the signature against.
     * @param missingAccountFunds Amount to pay the EntryPoint (0 if wallet has a deposit).
     * @return validationData 0 on success, 1 (SIG_VALIDATION_FAILED) on failure.
     *                        May pack a time range: <20-byte aggregator><6-byte validUntil><6-byte validAfter>
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

/// @notice Minimal IEntryPoint interface (v0.7) — only what the wallet needs.
interface IEntryPoint {
    /// @notice Return the nonce for this sender, for a given key.
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
}

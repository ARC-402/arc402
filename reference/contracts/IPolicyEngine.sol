// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPolicyEngine {
    function validateSpend(
        address wallet,
        string calldata category,
        uint256 amount,
        bytes32 contextId
    ) external view returns (bool valid, string memory reason);

    function recordSpend(
        address wallet,
        string calldata category,
        uint256 amount,
        bytes32 contextId
    ) external;

    // F-01: Called by ARC402Wallet.closeContext() to mark a contextId as closed.
    // Prevents the same contextId from being reused after the context is closed.
    function closeContext(address wallet, bytes32 contextId) external;

    function validateApproval(
        address wallet,
        address token,
        uint256 amount
    ) external view returns (bool valid, string memory reason);

    function registerWallet(address wallet, address owner) external;
    function enableDefiAccess(address wallet) external;

    // Attacker-LOW-5: Called by ARC402Wallet freeze/unfreeze to synchronize PolicyEngine
    // spendFrozen state with the wallet's frozen state.
    function freezeSpend(address wallet) external;
    function unfreeze(address wallet) external;
}

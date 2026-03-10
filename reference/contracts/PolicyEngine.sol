// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPolicyEngine.sol";

/**
 * @title PolicyEngine
 * @notice Stores and validates spending policies for ARC-402 wallets
 * STATUS: DRAFT — not audited, do not use in production
 */
contract PolicyEngine is IPolicyEngine {
    struct PolicyData {
        bytes32 policyHash;
        bytes policyData;
        uint256 updatedAt;
    }

    mapping(address => PolicyData) private policies;
    mapping(address => mapping(string => uint256)) public categoryLimits;
    mapping(address => address) public walletOwners;

    event PolicySet(address indexed wallet, bytes32 policyHash);
    event CategoryLimitSet(address indexed wallet, string category, uint256 limitPerTx);

    // Called by wallet to register itself
    function registerWallet(address wallet, address owner) external {
        walletOwners[wallet] = owner;
    }

    function setPolicy(bytes32 policyHash, bytes calldata policyData) external {
        policies[msg.sender] = PolicyData({
            policyHash: policyHash,
            policyData: policyData,
            updatedAt: block.timestamp
        });
        emit PolicySet(msg.sender, policyHash);
    }

    function getPolicy(address wallet) external view returns (bytes32, bytes memory) {
        PolicyData storage p = policies[wallet];
        return (p.policyHash, p.policyData);
    }

    function setCategoryLimit(string calldata category, uint256 limitPerTx) external {
        categoryLimits[msg.sender][category] = limitPerTx;
        emit CategoryLimitSet(msg.sender, category, limitPerTx);
    }

    function setCategoryLimitFor(address wallet, string calldata category, uint256 limitPerTx) external {
        // Allow owner to set limits for their wallet
        require(walletOwners[wallet] == msg.sender || wallet == msg.sender, "PolicyEngine: not authorized");
        categoryLimits[wallet][category] = limitPerTx;
        emit CategoryLimitSet(wallet, category, limitPerTx);
    }

    function validateSpend(
        address wallet,
        string calldata category,
        uint256 amount,
        bytes32 /*contextId*/
    ) external view returns (bool valid, string memory reason) {
        uint256 limit = categoryLimits[wallet][category];
        if (limit == 0) {
            return (false, "PolicyEngine: category not configured");
        }
        if (amount > limit) {
            return (false, "PolicyEngine: amount exceeds category limit");
        }
        return (true, "");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ITrustRegistry.sol";

/**
 * @title TrustRegistry
 * @notice On-chain trust scores for ARC-402 wallets (0–1000)
 * STATUS: DRAFT — not audited, do not use in production
 */
contract TrustRegistry is ITrustRegistry {
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant INITIAL_SCORE = 100;
    uint256 public constant INCREMENT = 5;
    uint256 public constant DECREMENT = 20;

    mapping(address => uint256) private scores;
    mapping(address => bool) private initialized;
    mapping(address => bool) public isAuthorizedUpdater;
    address public owner;

    event WalletInitialized(address indexed wallet, uint256 score);
    event ScoreUpdated(address indexed wallet, uint256 oldScore, uint256 newScore, string reason);
    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        isAuthorizedUpdater[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "TrustRegistry: not owner");
        _;
    }

    modifier onlyUpdater() {
        require(isAuthorizedUpdater[msg.sender], "TrustRegistry: not authorized updater");
        _;
    }

    function addUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = true;
        emit UpdaterAdded(updater);
    }

    function removeUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = false;
        emit UpdaterRemoved(updater);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TrustRegistry: zero address");
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    function renounceOwnership() external onlyOwner {
        address old = owner;
        owner = address(0);
        emit OwnershipTransferred(old, address(0));
    }

    function initWallet(address wallet) external {
        if (!initialized[wallet]) {
            initialized[wallet] = true;
            scores[wallet] = INITIAL_SCORE;
            emit WalletInitialized(wallet, INITIAL_SCORE);
        }
    }

    function getScore(address wallet) external view returns (uint256) {
        if (!initialized[wallet]) return 0;
        return scores[wallet];
    }

    function recordSuccess(address wallet) external onlyUpdater {
        if (!initialized[wallet]) {
            initialized[wallet] = true;
            scores[wallet] = INITIAL_SCORE;
        }
        uint256 oldScore = scores[wallet];
        uint256 newScore = oldScore + INCREMENT > MAX_SCORE ? MAX_SCORE : oldScore + INCREMENT;
        scores[wallet] = newScore;
        emit ScoreUpdated(wallet, oldScore, newScore, "success");
    }

    function recordAnomaly(address wallet) external onlyUpdater {
        if (!initialized[wallet]) {
            initialized[wallet] = true;
            scores[wallet] = INITIAL_SCORE;
        }
        uint256 oldScore = scores[wallet];
        uint256 newScore = oldScore < DECREMENT ? 0 : oldScore - DECREMENT;
        scores[wallet] = newScore;
        emit ScoreUpdated(wallet, oldScore, newScore, "anomaly");
    }

    function getTrustLevel(address wallet) external view returns (string memory) {
        uint256 score = scores[wallet];
        if (!initialized[wallet]) return "probationary";
        if (score < 100) return "probationary";
        if (score < 300) return "restricted";
        if (score < 600) return "standard";
        if (score < 800) return "elevated";
        return "autonomous";
    }
}

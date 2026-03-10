// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITrustRegistry {
    function getScore(address wallet) external view returns (uint256 score);
    function recordSuccess(address wallet) external;
    function recordAnomaly(address wallet) external;
    function initWallet(address wallet) external;
}

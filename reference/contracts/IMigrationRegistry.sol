// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMigrationRegistry {
    function resolveActiveWallet(address wallet) external view returns (address);
    function migratedTo(address wallet) external view returns (address);
    function getLineage(address wallet) external view returns (address[] memory);
}

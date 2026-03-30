// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    function isRegistered(address wallet) external view returns (bool);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title GovernedTokenWhitelist
 * @notice Minimal governance-owned whitelist for settlement / payment token allowlists.
 */
contract GovernedTokenWhitelist is Ownable2Step {
    mapping(address => bool) public isWhitelisted;

    event TokenWhitelistUpdated(address indexed token, bool allowed);

    constructor(address owner_) Ownable(owner_) {}

    function setToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "GovernedTokenWhitelist: zero token");
        isWhitelisted[token] = allowed;
        emit TokenWhitelistUpdated(token, allowed);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StubRegistryV2
 * @notice Testnet stub that satisfies ARC402Wallet constructor calls:
 *         - getContracts() → ProtocolContracts (10-field struct matching ARC402RegistryV2)
 *         - TrustRegistry.initWallet() → no-op
 *         - PolicyEngine.registerWallet() → no-op
 *         - PolicyEngine.enableDefiAccess() → no-op
 */

contract StubTrustRegistry {
    function initWallet(address) external {}
    function addUpdater(address) external {}
    function getEffectiveScore(address) external pure returns (uint256) { return 0; }
}

contract StubPolicyEngine {
    function registerWallet(address, address) external {}
    function enableDefiAccess(address) external {}
    function validateSpend(address, string calldata, uint256) external pure returns (bool, string memory) {
        return (true, "");
    }
    function recordSpend(address, string calldata, uint256, uint256) external {}
}

contract StubRegistryV2 {
    // ProtocolContracts fields (same order as ARC402RegistryV2):
    // policyEngine, trustRegistry, intentAttestation, serviceAgreement,
    // sessionChannels, agentRegistry, reputationOracle, settlementCoordinator,
    // vouchingRegistry, migrationRegistry

    address public policyEngine;
    address public trustRegistry;

    constructor() {
        trustRegistry = address(new StubTrustRegistry());
        policyEngine  = address(new StubPolicyEngine());
    }

    function getContracts() external view returns (
        address _policyEngine,
        address _trustRegistry,
        address intentAttestation,
        address serviceAgreement,
        address sessionChannels,
        address agentRegistry,
        address reputationOracle,
        address settlementCoordinator,
        address vouchingRegistry,
        address migrationRegistry
    ) {
        return (
            policyEngine,
            trustRegistry,
            address(0),
            address(0),
            address(0),
            address(0),
            address(0),
            address(0),
            address(0),
            address(0)
        );
    }
}

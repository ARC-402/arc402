// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ARC402RegistryV3
 * @notice Canonical registry of ARC-402 infrastructure addresses.
 *         Extends RegistryV2 with Arena-layer contracts (Handshake, etc.).
 *
 *         When ARC-402 deploys new contract versions, it updates the registry.
 *         Wallet owners opt into new versions by calling proposeRegistryUpdate().
 *         Nobody can force a wallet upgrade.
 *
 * Changes from V2:
 *   - Added `handshake` to ProtocolContracts struct
 *   - Future Arena contracts can be added in subsequent versions
 */
contract ARC402RegistryV3 {
    /// @notice Immutable owner — intentional by design.
    ///
    /// @dev Same security model as RegistryV2. No admin backdoor.
    ///      Recovery: deploy new registry, wallet owners opt in via
    ///      proposeRegistryUpdate() → 2-day timelock → executeRegistryUpdate().
    address public immutable owner;

    // ─── Protocol Contract Addresses ─────────────────────────────────────────

    address public policyEngine;
    address public trustRegistry;
    address public intentAttestation;
    address public serviceAgreement;
    address public sessionChannels;
    address public agentRegistry;
    address public reputationOracle;
    address public settlementCoordinator;
    address public vouchingRegistry;
    address public migrationRegistry;
    address public handshake;

    string public version;

    // ─── Struct ───────────────────────────────────────────────────────────────

    /// @notice Full set of protocol contract addresses.
    ///         Returned by getContracts() so wallets can resolve all addresses in one call.
    struct ProtocolContracts {
        address policyEngine;
        address trustRegistry;
        address intentAttestation;
        address serviceAgreement;
        address sessionChannels;
        address agentRegistry;
        address reputationOracle;
        address settlementCoordinator;
        address vouchingRegistry;
        address migrationRegistry;
        address handshake;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    event ContractsUpdated(
        string version,
        address indexed policyEngine,
        address indexed trustRegistry,
        address indexed intentAttestation,
        address settlementCoordinator
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _policyEngine          Required.
    /// @param _trustRegistry         Required.
    /// @param _intentAttestation     Required.
    /// @param _settlementCoordinator Required.
    /// @param _version               Version string.
    /// Extra protocol addresses default to address(0) and can be set via update().
    constructor(
        address _policyEngine,
        address _trustRegistry,
        address _intentAttestation,
        address _settlementCoordinator,
        string memory _version
    ) {
        require(_policyEngine != address(0), "Registry: zero policyEngine");
        require(_trustRegistry != address(0), "Registry: zero trustRegistry");
        require(_intentAttestation != address(0), "Registry: zero intentAttestation");
        require(_settlementCoordinator != address(0), "Registry: zero settlementCoordinator");
        owner = msg.sender;
        policyEngine = _policyEngine;
        trustRegistry = _trustRegistry;
        intentAttestation = _intentAttestation;
        settlementCoordinator = _settlementCoordinator;
        version = _version;
    }

    // ─── Modifier ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Registry: not owner");
        _;
    }

    // ─── View ────────────────────────────────────────────────────────────────

    /// @notice Returns all protocol contract addresses in one call.
    ///         Wallets call this after migrating to a new registry to refresh all pointers.
    function getContracts() external view returns (ProtocolContracts memory) {
        return ProtocolContracts({
            policyEngine:          policyEngine,
            trustRegistry:         trustRegistry,
            intentAttestation:     intentAttestation,
            serviceAgreement:      serviceAgreement,
            sessionChannels:       sessionChannels,
            agentRegistry:         agentRegistry,
            reputationOracle:      reputationOracle,
            settlementCoordinator: settlementCoordinator,
            vouchingRegistry:      vouchingRegistry,
            migrationRegistry:     migrationRegistry,
            handshake:             handshake
        });
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update all protocol contract addresses atomically.
    ///         Called by ARC-402 when deploying new infrastructure versions.
    ///         Wallet owners opt in via the timelocked proposeRegistryUpdate() flow.
    /// @param contracts New set of protocol addresses.
    /// @param _version  Human-readable version tag (e.g. "v3.0.0").
    function update(ProtocolContracts calldata contracts, string calldata _version) external onlyOwner {
        require(contracts.policyEngine != address(0),           "Registry: zero policyEngine");
        require(contracts.trustRegistry != address(0),          "Registry: zero trustRegistry");
        require(contracts.intentAttestation != address(0),      "Registry: zero intentAttestation");
        require(contracts.settlementCoordinator != address(0),  "Registry: zero settlementCoordinator");
        policyEngine          = contracts.policyEngine;
        trustRegistry         = contracts.trustRegistry;
        intentAttestation     = contracts.intentAttestation;
        settlementCoordinator = contracts.settlementCoordinator;
        serviceAgreement      = contracts.serviceAgreement;
        sessionChannels       = contracts.sessionChannels;
        agentRegistry         = contracts.agentRegistry;
        reputationOracle      = contracts.reputationOracle;
        vouchingRegistry      = contracts.vouchingRegistry;
        migrationRegistry     = contracts.migrationRegistry;
        handshake             = contracts.handshake;
        version = _version;
        emit ContractsUpdated(_version, contracts.policyEngine, contracts.trustRegistry, contracts.intentAttestation, contracts.settlementCoordinator);
    }
}

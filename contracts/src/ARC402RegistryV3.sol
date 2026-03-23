// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title ARC402RegistryV3
 * @notice Canonical registry of ARC-402 infrastructure addresses.
 *         Backward-compatible with V2: same ProtocolContracts struct fields +
 *         same getContracts() signature, plus new fields for compute/subscription
 *         agreements and a generic extensions mapping for future contracts.
 *
 *         When ARC-402 deploys new contract versions, it updates the registry.
 *         Wallet owners opt into new versions by calling proposeRegistryUpdate().
 *         Nobody can force a wallet upgrade.
 *
 *         Ownership uses Ownable2Step (safe two-step transfer) rather than the
 *         immutable owner used in V2. Two-step transfer is explicit and protected
 *         against accidents; the V2 immutable-owner model is preserved there.
 */
contract ARC402RegistryV3 is Ownable2Step {
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

    // V3 additions
    address public computeAgreement;
    address public subscriptionAgreement;
    address public disputeArbitration;
    address public disputeModule;

    string public version;

    // ─── Generic Extensions ───────────────────────────────────────────────────

    /// @notice Generic key→address map for future protocol contracts.
    ///         Keys are keccak256 of a human-readable name, e.g.
    ///         keccak256("handshake") or keccak256("agreementTree").
    mapping(bytes32 => address) public extensions;

    // ─── Struct ───────────────────────────────────────────────────────────────

    /// @notice Full set of protocol contract addresses.
    ///         Returned by getContracts() so wallets can resolve all addresses in one call.
    ///         Backward-compatible superset of V2's ProtocolContracts struct.
    struct ProtocolContracts {
        // V2-compatible fields (same order)
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
        // V3 additions
        address computeAgreement;
        address subscriptionAgreement;
        address disputeArbitration;
        address disputeModule;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event ContractsUpdated(
        string version,
        address indexed policyEngine,
        address indexed trustRegistry,
        address indexed intentAttestation,
        address settlementCoordinator
    );

    event ExtensionSet(bytes32 indexed key, address indexed addr);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _policyEngine           Required.
    /// @param _trustRegistry          Required.
    /// @param _intentAttestation      Required.
    /// @param _settlementCoordinator  Required.
    /// @param _serviceAgreement       Optional (address(0) accepted).
    /// @param _sessionChannels        Optional.
    /// @param _agentRegistry          Optional.
    /// @param _reputationOracle       Optional.
    /// @param _vouchingRegistry       Optional.
    /// @param _migrationRegistry      Optional.
    /// @param _computeAgreement       Optional (new in V3).
    /// @param _subscriptionAgreement  Optional (new in V3).
    /// @param _disputeArbitration     Optional (new in V3).
    /// @param _disputeModule          Optional (new in V3).
    /// @param _version                Version string (e.g. "v3.0.0").
    constructor(
        address _policyEngine,
        address _trustRegistry,
        address _intentAttestation,
        address _settlementCoordinator,
        address _serviceAgreement,
        address _sessionChannels,
        address _agentRegistry,
        address _reputationOracle,
        address _vouchingRegistry,
        address _migrationRegistry,
        address _computeAgreement,
        address _subscriptionAgreement,
        address _disputeArbitration,
        address _disputeModule,
        string memory _version
    ) Ownable(msg.sender) {
        require(_policyEngine != address(0),       "Registry: zero policyEngine");
        require(_trustRegistry != address(0),      "Registry: zero trustRegistry");
        require(_intentAttestation != address(0),  "Registry: zero intentAttestation");
        require(_settlementCoordinator != address(0), "Registry: zero settlementCoordinator");

        policyEngine          = _policyEngine;
        trustRegistry         = _trustRegistry;
        intentAttestation     = _intentAttestation;
        settlementCoordinator = _settlementCoordinator;
        serviceAgreement      = _serviceAgreement;
        sessionChannels       = _sessionChannels;
        agentRegistry         = _agentRegistry;
        reputationOracle      = _reputationOracle;
        vouchingRegistry      = _vouchingRegistry;
        migrationRegistry     = _migrationRegistry;
        computeAgreement      = _computeAgreement;
        subscriptionAgreement = _subscriptionAgreement;
        disputeArbitration    = _disputeArbitration;
        disputeModule         = _disputeModule;
        version               = _version;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

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
            computeAgreement:      computeAgreement,
            subscriptionAgreement: subscriptionAgreement,
            disputeArbitration:    disputeArbitration,
            disputeModule:         disputeModule
        });
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update all protocol contract addresses atomically.
    ///         Called by ARC-402 when deploying new infrastructure versions.
    ///         Wallet owners opt in via the timelocked proposeRegistryUpdate() flow.
    /// @param contracts New set of protocol addresses.
    /// @param _version  Human-readable version tag (e.g. "v3.1.0").
    function update(ProtocolContracts calldata contracts, string calldata _version) external onlyOwner {
        require(contracts.policyEngine != address(0),          "Registry: zero policyEngine");
        require(contracts.trustRegistry != address(0),         "Registry: zero trustRegistry");
        require(contracts.intentAttestation != address(0),     "Registry: zero intentAttestation");
        require(contracts.settlementCoordinator != address(0), "Registry: zero settlementCoordinator");

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
        computeAgreement      = contracts.computeAgreement;
        subscriptionAgreement = contracts.subscriptionAgreement;
        disputeArbitration    = contracts.disputeArbitration;
        disputeModule         = contracts.disputeModule;
        version               = _version;

        emit ContractsUpdated(
            _version,
            contracts.policyEngine,
            contracts.trustRegistry,
            contracts.intentAttestation,
            contracts.settlementCoordinator
        );
    }

    // ─── Extensions ───────────────────────────────────────────────────────────

    /// @notice Register or update a named extension contract address.
    /// @param key  keccak256 of the extension name, e.g. keccak256("handshake").
    /// @param addr The contract address (use address(0) to clear).
    function setExtension(bytes32 key, address addr) external onlyOwner {
        extensions[key] = addr;
        emit ExtensionSet(key, addr);
    }

    /// @notice Resolve a named extension contract address.
    /// @param key  keccak256 of the extension name.
    function getExtension(bytes32 key) external view returns (address) {
        return extensions[key];
    }
}

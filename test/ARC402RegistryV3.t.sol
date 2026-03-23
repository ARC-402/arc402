// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../contracts/src/ARC402RegistryV3.sol";

/**
 * @title ARC402RegistryV3Test
 * @notice Full test suite for ARC402RegistryV3.
 */
contract ARC402RegistryV3Test is Test {
    // ─── Addresses ────────────────────────────────────────────────────────────

    address constant POLICY_ENGINE           = address(0xA1);
    address constant TRUST_REGISTRY          = address(0xA2);
    address constant INTENT_ATTESTATION      = address(0xA3);
    address constant SETTLEMENT_COORDINATOR  = address(0xA4);
    address constant SERVICE_AGREEMENT       = address(0xA5);
    address constant SESSION_CHANNELS        = address(0xA6);
    address constant AGENT_REGISTRY          = address(0xA7);
    address constant REPUTATION_ORACLE       = address(0xA8);
    address constant VOUCHING_REGISTRY       = address(0xA9);
    address constant MIGRATION_REGISTRY      = address(0xAA);
    address constant COMPUTE_AGREEMENT       = address(0xB1);
    address constant SUBSCRIPTION_AGREEMENT  = address(0xB2);
    address constant DISPUTE_ARBITRATION     = address(0xB3);
    address constant DISPUTE_MODULE          = address(0xB4);

    address constant OWNER     = address(0xDEAD);
    address constant NOT_OWNER = address(0xBEEF);
    address constant NEW_OWNER = address(0xCAFE);

    ARC402RegistryV3 registry;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.prank(OWNER);
        registry = new ARC402RegistryV3(
            POLICY_ENGINE,
            TRUST_REGISTRY,
            INTENT_ATTESTATION,
            SETTLEMENT_COORDINATOR,
            SERVICE_AGREEMENT,
            SESSION_CHANNELS,
            AGENT_REGISTRY,
            REPUTATION_ORACLE,
            VOUCHING_REGISTRY,
            MIGRATION_REGISTRY,
            COMPUTE_AGREEMENT,
            SUBSCRIPTION_AGREEMENT,
            DISPUTE_ARBITRATION,
            DISPUTE_MODULE,
            "v3.0.0"
        );
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsAllFields() public view {
        assertEq(registry.policyEngine(),          POLICY_ENGINE);
        assertEq(registry.trustRegistry(),         TRUST_REGISTRY);
        assertEq(registry.intentAttestation(),     INTENT_ATTESTATION);
        assertEq(registry.settlementCoordinator(), SETTLEMENT_COORDINATOR);
        assertEq(registry.serviceAgreement(),      SERVICE_AGREEMENT);
        assertEq(registry.sessionChannels(),       SESSION_CHANNELS);
        assertEq(registry.agentRegistry(),         AGENT_REGISTRY);
        assertEq(registry.reputationOracle(),      REPUTATION_ORACLE);
        assertEq(registry.vouchingRegistry(),      VOUCHING_REGISTRY);
        assertEq(registry.migrationRegistry(),     MIGRATION_REGISTRY);
        assertEq(registry.computeAgreement(),      COMPUTE_AGREEMENT);
        assertEq(registry.subscriptionAgreement(), SUBSCRIPTION_AGREEMENT);
        assertEq(registry.disputeArbitration(),    DISPUTE_ARBITRATION);
        assertEq(registry.disputeModule(),         DISPUTE_MODULE);
        assertEq(registry.version(),               "v3.0.0");
    }

    function test_constructor_setsOwner() public view {
        assertEq(registry.owner(), OWNER);
    }

    function test_constructor_revertsOnZeroPolicyEngine() public {
        vm.expectRevert("Registry: zero policyEngine");
        new ARC402RegistryV3(
            address(0), TRUST_REGISTRY, INTENT_ATTESTATION, SETTLEMENT_COORDINATOR,
            address(0), address(0), address(0), address(0), address(0), address(0),
            address(0), address(0), address(0), address(0), "v3.0.0"
        );
    }

    function test_constructor_revertsOnZeroTrustRegistry() public {
        vm.expectRevert("Registry: zero trustRegistry");
        new ARC402RegistryV3(
            POLICY_ENGINE, address(0), INTENT_ATTESTATION, SETTLEMENT_COORDINATOR,
            address(0), address(0), address(0), address(0), address(0), address(0),
            address(0), address(0), address(0), address(0), "v3.0.0"
        );
    }

    function test_constructor_revertsOnZeroIntentAttestation() public {
        vm.expectRevert("Registry: zero intentAttestation");
        new ARC402RegistryV3(
            POLICY_ENGINE, TRUST_REGISTRY, address(0), SETTLEMENT_COORDINATOR,
            address(0), address(0), address(0), address(0), address(0), address(0),
            address(0), address(0), address(0), address(0), "v3.0.0"
        );
    }

    function test_constructor_revertsOnZeroSettlementCoordinator() public {
        vm.expectRevert("Registry: zero settlementCoordinator");
        new ARC402RegistryV3(
            POLICY_ENGINE, TRUST_REGISTRY, INTENT_ATTESTATION, address(0),
            address(0), address(0), address(0), address(0), address(0), address(0),
            address(0), address(0), address(0), address(0), "v3.0.0"
        );
    }

    function test_constructor_optionalFieldsCanBeZero() public {
        // Only required fields non-zero, all optional fields zero
        ARC402RegistryV3 r = new ARC402RegistryV3(
            POLICY_ENGINE, TRUST_REGISTRY, INTENT_ATTESTATION, SETTLEMENT_COORDINATOR,
            address(0), address(0), address(0), address(0), address(0), address(0),
            address(0), address(0), address(0), address(0), "v3.0.0"
        );
        assertEq(r.computeAgreement(),      address(0));
        assertEq(r.subscriptionAgreement(), address(0));
        assertEq(r.disputeArbitration(),    address(0));
        assertEq(r.disputeModule(),         address(0));
    }

    // ─── getContracts ─────────────────────────────────────────────────────────

    function test_getContracts_returnsAllFields() public view {
        ARC402RegistryV3.ProtocolContracts memory c = registry.getContracts();
        assertEq(c.policyEngine,          POLICY_ENGINE);
        assertEq(c.trustRegistry,         TRUST_REGISTRY);
        assertEq(c.intentAttestation,     INTENT_ATTESTATION);
        assertEq(c.settlementCoordinator, SETTLEMENT_COORDINATOR);
        assertEq(c.serviceAgreement,      SERVICE_AGREEMENT);
        assertEq(c.sessionChannels,       SESSION_CHANNELS);
        assertEq(c.agentRegistry,         AGENT_REGISTRY);
        assertEq(c.reputationOracle,      REPUTATION_ORACLE);
        assertEq(c.vouchingRegistry,      VOUCHING_REGISTRY);
        assertEq(c.migrationRegistry,     MIGRATION_REGISTRY);
        assertEq(c.computeAgreement,      COMPUTE_AGREEMENT);
        assertEq(c.subscriptionAgreement, SUBSCRIPTION_AGREEMENT);
        assertEq(c.disputeArbitration,    DISPUTE_ARBITRATION);
        assertEq(c.disputeModule,         DISPUTE_MODULE);
    }

    // ─── update ───────────────────────────────────────────────────────────────

    function test_update_setsNewAddresses() public {
        address newPE  = address(0xC1);
        address newTR  = address(0xC2);
        address newIA  = address(0xC3);
        address newSC  = address(0xC4);
        address newCA  = address(0xC5);
        address newSA  = address(0xC6);

        ARC402RegistryV3.ProtocolContracts memory newContracts = ARC402RegistryV3.ProtocolContracts({
            policyEngine:          newPE,
            trustRegistry:         newTR,
            intentAttestation:     newIA,
            settlementCoordinator: newSC,
            serviceAgreement:      address(0),
            sessionChannels:       address(0),
            agentRegistry:         address(0),
            reputationOracle:      address(0),
            vouchingRegistry:      address(0),
            migrationRegistry:     address(0),
            computeAgreement:      newCA,
            subscriptionAgreement: newSA,
            disputeArbitration:    address(0),
            disputeModule:         address(0)
        });

        vm.prank(OWNER);
        registry.update(newContracts, "v3.1.0");

        assertEq(registry.policyEngine(),          newPE);
        assertEq(registry.trustRegistry(),         newTR);
        assertEq(registry.intentAttestation(),     newIA);
        assertEq(registry.settlementCoordinator(), newSC);
        assertEq(registry.computeAgreement(),      newCA);
        assertEq(registry.subscriptionAgreement(), newSA);
        assertEq(registry.version(),               "v3.1.0");
    }

    function test_update_emitsContractsUpdated() public {
        ARC402RegistryV3.ProtocolContracts memory c = ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0),
            sessionChannels:       address(0),
            agentRegistry:         address(0),
            reputationOracle:      address(0),
            vouchingRegistry:      address(0),
            migrationRegistry:     address(0),
            computeAgreement:      address(0),
            subscriptionAgreement: address(0),
            disputeArbitration:    address(0),
            disputeModule:         address(0)
        });

        vm.prank(OWNER);
        vm.expectEmit(true, true, true, true);
        emit ARC402RegistryV3.ContractsUpdated(
            "v3.1.0", POLICY_ENGINE, TRUST_REGISTRY, INTENT_ATTESTATION, SETTLEMENT_COORDINATOR
        );
        registry.update(c, "v3.1.0");
    }

    function test_update_revertsIfNotOwner() public {
        ARC402RegistryV3.ProtocolContracts memory c = ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0),
            sessionChannels:       address(0),
            agentRegistry:         address(0),
            reputationOracle:      address(0),
            vouchingRegistry:      address(0),
            migrationRegistry:     address(0),
            computeAgreement:      address(0),
            subscriptionAgreement: address(0),
            disputeArbitration:    address(0),
            disputeModule:         address(0)
        });

        vm.prank(NOT_OWNER);
        vm.expectRevert();
        registry.update(c, "v3.1.0");
    }

    function test_update_revertsOnZeroPolicyEngine() public {
        vm.prank(OWNER);
        vm.expectRevert("Registry: zero policyEngine");
        registry.update(ARC402RegistryV3.ProtocolContracts({
            policyEngine:          address(0),
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0), sessionChannels:    address(0),
            agentRegistry:         address(0), reputationOracle:   address(0),
            vouchingRegistry:      address(0), migrationRegistry:  address(0),
            computeAgreement:      address(0), subscriptionAgreement: address(0),
            disputeArbitration:    address(0), disputeModule:      address(0)
        }), "v3.1.0");
    }

    function test_update_revertsOnZeroTrustRegistry() public {
        vm.prank(OWNER);
        vm.expectRevert("Registry: zero trustRegistry");
        registry.update(ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         address(0),
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0), sessionChannels:    address(0),
            agentRegistry:         address(0), reputationOracle:   address(0),
            vouchingRegistry:      address(0), migrationRegistry:  address(0),
            computeAgreement:      address(0), subscriptionAgreement: address(0),
            disputeArbitration:    address(0), disputeModule:      address(0)
        }), "v3.1.0");
    }

    function test_update_revertsOnZeroIntentAttestation() public {
        vm.prank(OWNER);
        vm.expectRevert("Registry: zero intentAttestation");
        registry.update(ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     address(0),
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0), sessionChannels:    address(0),
            agentRegistry:         address(0), reputationOracle:   address(0),
            vouchingRegistry:      address(0), migrationRegistry:  address(0),
            computeAgreement:      address(0), subscriptionAgreement: address(0),
            disputeArbitration:    address(0), disputeModule:      address(0)
        }), "v3.1.0");
    }

    function test_update_revertsOnZeroSettlementCoordinator() public {
        vm.prank(OWNER);
        vm.expectRevert("Registry: zero settlementCoordinator");
        registry.update(ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: address(0),
            serviceAgreement:      address(0), sessionChannels:    address(0),
            agentRegistry:         address(0), reputationOracle:   address(0),
            vouchingRegistry:      address(0), migrationRegistry:  address(0),
            computeAgreement:      address(0), subscriptionAgreement: address(0),
            disputeArbitration:    address(0), disputeModule:      address(0)
        }), "v3.1.0");
    }

    // ─── Extensions ───────────────────────────────────────────────────────────

    function test_setExtension_storesAddress() public {
        bytes32 key = keccak256("handshake");
        address handshake = address(0xE1);

        vm.prank(OWNER);
        registry.setExtension(key, handshake);

        assertEq(registry.getExtension(key), handshake);
        assertEq(registry.extensions(key), handshake);
    }

    function test_setExtension_emitsExtensionSet() public {
        bytes32 key = keccak256("handshake");
        address handshake = address(0xE1);

        vm.prank(OWNER);
        vm.expectEmit(true, true, false, false);
        emit ARC402RegistryV3.ExtensionSet(key, handshake);
        registry.setExtension(key, handshake);
    }

    function test_setExtension_canClearWithZeroAddress() public {
        bytes32 key = keccak256("handshake");
        vm.prank(OWNER);
        registry.setExtension(key, address(0xE1));

        vm.prank(OWNER);
        registry.setExtension(key, address(0));

        assertEq(registry.getExtension(key), address(0));
    }

    function test_setExtension_revertsIfNotOwner() public {
        bytes32 key = keccak256("handshake");
        vm.prank(NOT_OWNER);
        vm.expectRevert();
        registry.setExtension(key, address(0xE1));
    }

    function test_getExtension_returnsZeroForUnknownKey() public view {
        assertEq(registry.getExtension(keccak256("unknown")), address(0));
    }

    function test_setExtension_multipleKeys() public {
        bytes32 k1 = keccak256("handshake");
        bytes32 k2 = keccak256("agreementTree");
        bytes32 k3 = keccak256("watchtower");

        vm.startPrank(OWNER);
        registry.setExtension(k1, address(0xE1));
        registry.setExtension(k2, address(0xE2));
        registry.setExtension(k3, address(0xE3));
        vm.stopPrank();

        assertEq(registry.getExtension(k1), address(0xE1));
        assertEq(registry.getExtension(k2), address(0xE2));
        assertEq(registry.getExtension(k3), address(0xE3));
    }

    // ─── Ownable2Step ─────────────────────────────────────────────────────────

    function test_ownable2step_pendingOwnerAfterTransfer() public {
        vm.prank(OWNER);
        registry.transferOwnership(NEW_OWNER);

        assertEq(registry.owner(), OWNER);            // still owner until accepted
        assertEq(registry.pendingOwner(), NEW_OWNER);
    }

    function test_ownable2step_newOwnerAccepts() public {
        vm.prank(OWNER);
        registry.transferOwnership(NEW_OWNER);

        vm.prank(NEW_OWNER);
        registry.acceptOwnership();

        assertEq(registry.owner(), NEW_OWNER);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_ownable2step_nonPendingCannotAccept() public {
        vm.prank(OWNER);
        registry.transferOwnership(NEW_OWNER);

        vm.prank(NOT_OWNER);
        vm.expectRevert();
        registry.acceptOwnership();
    }

    function test_ownable2step_newOwnerCanUpdate() public {
        vm.prank(OWNER);
        registry.transferOwnership(NEW_OWNER);
        vm.prank(NEW_OWNER);
        registry.acceptOwnership();

        ARC402RegistryV3.ProtocolContracts memory c = ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0),
            sessionChannels:       address(0),
            agentRegistry:         address(0),
            reputationOracle:      address(0),
            vouchingRegistry:      address(0),
            migrationRegistry:     address(0),
            computeAgreement:      address(0),
            subscriptionAgreement: address(0),
            disputeArbitration:    address(0),
            disputeModule:         address(0)
        });

        vm.prank(NEW_OWNER);
        registry.update(c, "v3.2.0");
        assertEq(registry.version(), "v3.2.0");
    }

    function test_ownable2step_oldOwnerCannotUpdateAfterTransfer() public {
        vm.prank(OWNER);
        registry.transferOwnership(NEW_OWNER);
        vm.prank(NEW_OWNER);
        registry.acceptOwnership();

        ARC402RegistryV3.ProtocolContracts memory c = ARC402RegistryV3.ProtocolContracts({
            policyEngine:          POLICY_ENGINE,
            trustRegistry:         TRUST_REGISTRY,
            intentAttestation:     INTENT_ATTESTATION,
            settlementCoordinator: SETTLEMENT_COORDINATOR,
            serviceAgreement:      address(0),
            sessionChannels:       address(0),
            agentRegistry:         address(0),
            reputationOracle:      address(0),
            vouchingRegistry:      address(0),
            migrationRegistry:     address(0),
            computeAgreement:      address(0),
            subscriptionAgreement: address(0),
            disputeArbitration:    address(0),
            disputeModule:         address(0)
        });

        vm.prank(OWNER);
        vm.expectRevert();
        registry.update(c, "v3.2.0");
    }
}

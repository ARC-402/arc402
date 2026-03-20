// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ARC402WalletV2 — Patched wallet that references ARC402RegistryV3
//
// This file documents the EXACT changes needed from ARC402Wallet.sol.
// Rather than duplicating the entire 900+ line wallet, this is a patch spec.
//
// CHANGES FROM ARC402Wallet.sol:
//
// 1. Import line (line 7):
//    - import "./ARC402RegistryV2.sol";
//    + import "./ARC402RegistryV3.sol";
//
// 2. Storage variable (line 77):
//    - ARC402RegistryV2 public registry;
//    + ARC402RegistryV3 public registry;
//
// 3. Constructor (line 209):
//    - registry = ARC402RegistryV2(_registry);
//    + registry = ARC402RegistryV3(_registry);
//
// 4. executeRegistryUpdate (line 383):
//    - registry = ARC402RegistryV2(pendingRegistry);
//    + registry = ARC402RegistryV3(pendingRegistry);
//
// 5. _resolveContracts return type (line 582-583):
//    - function _resolveContracts() internal view returns (ARC402RegistryV2.ProtocolContracts memory) {
//    -     return ARC402RegistryV2(registry).getContracts();
//    + function _resolveContracts() internal view returns (ARC402RegistryV3.ProtocolContracts memory) {
//    +     return ARC402RegistryV3(registry).getContracts();
//
// 6. isProtocolContract check (line 843-854) — ADD one line:
//    bool isProtocolContract = (
//        params.target == pc.policyEngine ||
//        params.target == pc.trustRegistry ||
//        params.target == pc.intentAttestation ||
//        params.target == pc.serviceAgreement ||
//        params.target == pc.sessionChannels ||
//        params.target == pc.agentRegistry ||
//        params.target == pc.reputationOracle ||
//        params.target == pc.settlementCoordinator ||
//        params.target == pc.vouchingRegistry ||
//    -   params.target == pc.migrationRegistry
//    +   params.target == pc.migrationRegistry ||
//    +   params.target == pc.handshake
//    );
//
// That's it. 6 surgical changes. No logic changes. No new functions.
// The wallet gains auto-whitelisting of the Handshake contract for all agents.

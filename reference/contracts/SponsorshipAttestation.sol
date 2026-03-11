// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SponsorshipAttestation
 * @notice Optional opt-in registry for agency-agent associations.
 * STATUS: DRAFT — not audited, do not use in production
 */
contract SponsorshipAttestation {

    // ─── Types ────────────────────────────────────────────────────────────────

    enum IdentityTier {
        NONE,
        SPONSORED,
        VERIFIED_PROVIDER,
        ENTERPRISE_PROVIDER
    }

    struct Attestation {
        address sponsor;
        address agent;
        uint256 issuedAt;
        uint256 expiresAt;
        bool revoked;
        IdentityTier tier;
        string evidenceURI;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(bytes32 => Attestation) public attestations;
    mapping(address => bytes32[]) private _sponsorAttestations;
    mapping(address => bytes32[]) private _agentAttestations;
    uint256 private _nonce;
    mapping(address => mapping(address => bytes32)) public activeAttestation;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AttestationPublished(
        bytes32 indexed attestationId,
        address indexed sponsor,
        address indexed agent,
        uint256 expiresAt,
        IdentityTier tier,
        string evidenceURI
    );
    event AttestationRevoked(bytes32 indexed attestationId, address indexed sponsor, address indexed agent);

    // ─── Core Functions ───────────────────────────────────────────────────────

    function publish(address agent, uint256 expiresAt) external returns (bytes32 attestationId) {
        return publishWithTier(agent, expiresAt, IdentityTier.SPONSORED, "");
    }

    function publishWithTier(
        address agent,
        uint256 expiresAt,
        IdentityTier tier,
        string memory evidenceURI
    ) public returns (bytes32 attestationId) {
        require(agent != address(0), "SponsorshipAttestation: zero agent");
        require(agent != msg.sender, "SponsorshipAttestation: self-attestation");
        require(expiresAt == 0 || expiresAt > block.timestamp, "SponsorshipAttestation: already expired");
        require(activeAttestation[msg.sender][agent] == bytes32(0), "SponsorshipAttestation: active attestation exists, revoke first");
        require(tier != IdentityTier.NONE, "SponsorshipAttestation: invalid tier");
        require(bytes(evidenceURI).length <= 256, "SponsorshipAttestation: evidenceURI too long");

        attestationId = keccak256(abi.encodePacked(msg.sender, agent, block.timestamp, _nonce++));

        attestations[attestationId] = Attestation({
            sponsor: msg.sender,
            agent: agent,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            revoked: false,
            tier: tier,
            evidenceURI: evidenceURI
        });

        _sponsorAttestations[msg.sender].push(attestationId);
        _agentAttestations[agent].push(attestationId);
        activeAttestation[msg.sender][agent] = attestationId;

        emit AttestationPublished(attestationId, msg.sender, agent, expiresAt, tier, evidenceURI);
    }

    function revoke(bytes32 attestationId) external {
        Attestation storage att = attestations[attestationId];
        require(att.sponsor == msg.sender, "SponsorshipAttestation: not sponsor");
        require(!att.revoked, "SponsorshipAttestation: already revoked");

        att.revoked = true;
        activeAttestation[msg.sender][att.agent] = bytes32(0);

        emit AttestationRevoked(attestationId, msg.sender, att.agent);
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    function isActive(bytes32 attestationId) external view returns (bool) {
        Attestation storage att = attestations[attestationId];
        if (att.sponsor == address(0)) return false;
        if (att.revoked) return false;
        if (att.expiresAt != 0 && block.timestamp > att.expiresAt) return false;
        return true;
    }

    function getActiveAttestation(address sponsor, address agent) external view returns (bytes32) {
        bytes32 id = activeAttestation[sponsor][agent];
        if (id == bytes32(0)) return bytes32(0);
        Attestation storage att = attestations[id];
        if (att.revoked) return bytes32(0);
        if (att.expiresAt != 0 && block.timestamp > att.expiresAt) return bytes32(0);
        return id;
    }

    function getAttestation(bytes32 attestationId) external view returns (Attestation memory) {
        return attestations[attestationId];
    }

    function getSponsorAttestations(address sponsor) external view returns (bytes32[] memory) {
        return _sponsorAttestations[sponsor];
    }

    function getAgentAttestations(address agent) external view returns (bytes32[] memory) {
        return _agentAttestations[agent];
    }

    function activeSponsorCount(address sponsor) external view returns (uint256 count) {
        bytes32[] storage ids = _sponsorAttestations[sponsor];
        for (uint256 i = 0; i < ids.length; i++) {
            Attestation storage att = attestations[ids[i]];
            if (!att.revoked && (att.expiresAt == 0 || block.timestamp <= att.expiresAt)) {
                count++;
            }
        }
    }

    function getHighestTier(address agent) external view returns (IdentityTier tier) {
        bytes32[] storage ids = _agentAttestations[agent];
        for (uint256 i = 0; i < ids.length; i++) {
            Attestation storage att = attestations[ids[i]];
            if (att.revoked) continue;
            if (att.expiresAt != 0 && block.timestamp > att.expiresAt) continue;
            if (uint8(att.tier) > uint8(tier)) {
                tier = att.tier;
            }
        }
    }
}

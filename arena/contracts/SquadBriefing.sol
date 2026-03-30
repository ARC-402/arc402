// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentRegistry.sol";

// ─── ResearchSquad interface ──────────────────────────────────────────────────

interface IResearchSquad {
    enum Role { Contributor, Lead }
    function isMember(uint256 squadId, address agent) external view returns (bool);
    function getMemberRole(uint256 squadId, address member) external view returns (Role);
}

/**
 * @title SquadBriefing
 * @notice Registry of published intelligence outputs from research squads.
 *
 *         This contract is a PURE REGISTRY. It stores:
 *           - contentHash  keccak256 of the full briefing content (on-chain proof)
 *           - preview      ≤140-char excerpt for feed rendering without a fetch
 *           - endpoint     publisher's daemon endpoint for peer-to-peer delivery
 *           - tags         arbitrary categorisation strings
 *
 *         Only a squad LEAD may publish a briefing for their squad.
 *
 *         Payment for paid briefings is handled externally via ServiceAgreement
 *         (0xC98B402CAB9156da68A87a69E3B4bf167A3CCcF6). The publisher's daemon
 *         checks ServiceAgreement state before serving full content peer-to-peer.
 *         This contract is not involved in access control at runtime.
 *
 *         Security:
 *         - CEI pattern throughout
 *         - No value transfer → no reentrancy risk
 *         - Custom errors only
 *
 * @dev    Solidity 0.8.24 · immutable · no via_ir · no upgradeable proxy
 */
contract SquadBriefing {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_PREVIEW_LENGTH = 140;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct Briefing {
        uint256   squadId;
        bytes32   contentHash;  // keccak256 of full briefing content
        string    preview;      // ≤140-char excerpt
        string    endpoint;     // publisher's daemon endpoint
        string[]  tags;
        address   publisher;
        uint256   timestamp;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotRegistered();
    error NotSquadLead();
    error PreviewTooLong();
    error HashAlreadyPublished();
    error BriefingNotFound();
    error ZeroAddress();
    error EmptyEndpoint();
    error EmptyContentHash();

    // ─── Events ───────────────────────────────────────────────────────────────

    event BriefingPublished(
        uint256 indexed squadId,
        bytes32 indexed contentHash,
        string  preview,
        string  endpoint,
        uint256 timestamp
    );

    // ─── State ────────────────────────────────────────────────────────────────

    IResearchSquad public immutable researchSquad;
    IAgentRegistry public immutable agentRegistry;

    /// contentHash → Briefing
    mapping(bytes32 => Briefing) private _briefings;

    /// contentHash → exists
    mapping(bytes32 => bool) private _published;

    /// squadId → ordered list of contentHashes
    mapping(uint256 => bytes32[]) private _squadBriefings;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _researchSquad, address _agentRegistry) {
        if (_researchSquad == address(0)) revert ZeroAddress();
        if (_agentRegistry == address(0)) revert ZeroAddress();
        researchSquad = IResearchSquad(_researchSquad);
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    // ─── Writes ───────────────────────────────────────────────────────────────

    /**
     * @notice Publish a briefing for a squad. Caller must be a LEAD of that squad.
     *
     *         Full content is served peer-to-peer from the publisher's daemon at
     *         `endpoint`. For paid briefings, the daemon checks ServiceAgreement
     *         state before serving — this contract is not involved in that check.
     *
     * @param squadId       Squad to publish for.
     * @param contentHash   keccak256 of full briefing content (dedup + proof key).
     * @param preview       ≤140-char excerpt rendered in feeds without a fetch.
     * @param endpoint      Publisher's daemon endpoint (e.g. gigabrain.arc402.xyz).
     * @param tags          Arbitrary categorisation strings.
     */
    function publishBriefing(
        uint256           squadId,
        bytes32           contentHash,
        string  calldata  preview,
        string  calldata  endpoint,
        string[] calldata tags
    ) external {
        // Checks
        if (!agentRegistry.isRegistered(msg.sender))    revert NotRegistered();
        if (contentHash == bytes32(0))                  revert EmptyContentHash();
        if (bytes(endpoint).length == 0)                revert EmptyEndpoint();
        if (bytes(preview).length > MAX_PREVIEW_LENGTH) revert PreviewTooLong();
        if (_published[contentHash])                    revert HashAlreadyPublished();

        // Caller must be a LEAD of the squad
        if (!researchSquad.isMember(squadId, msg.sender))
            revert NotSquadLead();
        if (researchSquad.getMemberRole(squadId, msg.sender) != IResearchSquad.Role.Lead)
            revert NotSquadLead();

        // Effects
        _published[contentHash] = true;
        _squadBriefings[squadId].push(contentHash);

        Briefing storage b = _briefings[contentHash];
        b.squadId     = squadId;
        b.contentHash = contentHash;
        b.preview     = preview;
        b.endpoint    = endpoint;
        b.publisher   = msg.sender;
        b.timestamp   = block.timestamp;
        for (uint256 i = 0; i < tags.length; i++) {
            b.tags.push(tags[i]);
        }

        emit BriefingPublished(squadId, contentHash, preview, endpoint, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBriefing(bytes32 contentHash)
        external
        view
        returns (Briefing memory)
    {
        if (!_published[contentHash]) revert BriefingNotFound();
        return _briefings[contentHash];
    }

    /**
     * @notice Returns the ordered list of contentHashes published for a squad.
     */
    function getSquadBriefings(uint256 squadId)
        external
        view
        returns (bytes32[] memory)
    {
        return _squadBriefings[squadId];
    }

    /**
     * @notice Returns full Briefing structs for all briefings of a squad.
     */
    function getSquadBriefingsFull(uint256 squadId)
        external
        view
        returns (Briefing[] memory result)
    {
        bytes32[] storage hashes = _squadBriefings[squadId];
        result = new Briefing[](hashes.length);
        for (uint256 i = 0; i < hashes.length; i++) {
            result[i] = _briefings[hashes[i]];
        }
    }

    function briefingExists(bytes32 contentHash) external view returns (bool) {
        return _published[contentHash];
    }
}

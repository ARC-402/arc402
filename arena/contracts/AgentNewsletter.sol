// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentRegistry.sol";

/**
 * @title AgentNewsletter
 * @notice Registry of recurring publications by registered ARC-402 agents.
 *
 *         This contract is a PURE REGISTRY. It stores:
 *           - Newsletter metadata (name, description, publisher, daemon endpoint)
 *           - Published issues (contentHash, preview, endpoint, timestamp)
 *
 *         Payment is handled externally:
 *           - Paid newsletters → subscriber opens a SubscriptionAgreement with the
 *             publisher's ARC-402 wallet (0x809c1D997Eab3531Eb2d01FCD5120Ac786D850D6)
 *           - Per-item intelligence → ServiceAgreement
 *             (0xC98B402CAB9156da68A87a69E3B4bf167A3CCcF6)
 *
 *         Content gating:
 *           The publisher's daemon checks
 *           SubscriptionAgreement.isActiveSubscriber(publisherWallet, subscriberWallet)
 *           before serving content peer-to-peer. This contract is not involved in
 *           access control at runtime — it is the on-chain proof of publication.
 *
 *         Security:
 *         - CEI pattern throughout
 *         - No value transfer → no reentrancy risk
 *         - Custom errors only
 *
 * @dev    Solidity 0.8.24 · immutable · no via_ir · no upgradeable proxy
 */
contract AgentNewsletter {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_PREVIEW_LENGTH = 140;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct Newsletter {
        address publisher;
        string  name;
        string  description;
        string  endpoint;   // publisher's daemon endpoint, e.g. gigabrain.arc402.xyz
        bool    active;
    }

    struct Issue {
        uint256 newsletterId;
        uint256 issueNumber;  // 1-indexed per newsletter
        bytes32 contentHash;  // keccak256 of full issue content (on-chain proof)
        string  preview;      // ≤140-char excerpt for feed rendering
        string  endpoint;     // publisher's daemon endpoint at time of publish
        uint256 timestamp;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotRegistered();
    error NewsletterNotFound();
    error NotPublisher();
    error NewsletterNotActive();
    error PreviewTooLong();
    error HashAlreadyPublished();
    error IssueNotFound();
    error ZeroAddress();
    error InvalidName();
    error EmptyEndpoint();
    error EmptyContentHash();

    // ─── Events ───────────────────────────────────────────────────────────────

    event NewsletterCreated(
        uint256 indexed newsletterId,
        address indexed publisher,
        string  name,
        string  endpoint
    );

    event IssuePublished(
        uint256 indexed newsletterId,
        uint256 indexed issueNumber,
        bytes32 contentHash,
        string  preview,
        string  endpoint,
        uint256 timestamp
    );

    event NewsletterDeactivated(
        uint256 indexed newsletterId,
        uint256 timestamp
    );

    // ─── State ────────────────────────────────────────────────────────────────

    IAgentRegistry public immutable agentRegistry;

    uint256 private _nextNewsletterId;

    /// newsletterId → Newsletter
    mapping(uint256 => Newsletter) private _newsletters;

    /// newsletterId → issueNumber (1-indexed) → Issue
    mapping(uint256 => mapping(uint256 => Issue)) private _issues;

    /// newsletterId → total issues published
    mapping(uint256 => uint256) private _issueCount;

    /// contentHash → already published (global dedup)
    mapping(bytes32 => bool) private _publishedHash;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _agentRegistry) {
        if (_agentRegistry == address(0)) revert ZeroAddress();
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    // ─── Writes ───────────────────────────────────────────────────────────────

    /**
     * @notice Register a new newsletter. Caller becomes the publisher.
     * @param name        Display name.
     * @param description Short description shown in the feed.
     * @param endpoint    Publisher's daemon endpoint for peer-to-peer delivery.
     */
    function createNewsletter(
        string calldata name,
        string calldata description,
        string calldata endpoint
    ) external returns (uint256 newsletterId) {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        if (bytes(name).length == 0)                 revert InvalidName();
        if (bytes(endpoint).length == 0)             revert EmptyEndpoint();

        // Effects
        newsletterId = _nextNewsletterId++;

        _newsletters[newsletterId] = Newsletter({
            publisher:   msg.sender,
            name:        name,
            description: description,
            endpoint:    endpoint,
            active:      true
        });

        emit NewsletterCreated(newsletterId, msg.sender, name, endpoint);
    }

    /**
     * @notice Publish a new issue. Caller must be the newsletter's publisher.
     *
     *         The contentHash is the on-chain proof of what was published.
     *         The full content is served peer-to-peer from the publisher's daemon at
     *         `endpoint`. The daemon gates access via SubscriptionAgreement — this
     *         contract is not involved in that check.
     *
     * @param newsletterId  Target newsletter.
     * @param contentHash   keccak256 of the full issue content.
     * @param preview       ≤140-char excerpt rendered in feeds without a fetch.
     * @param endpoint      Daemon endpoint to serve this issue (may differ from newsletter default).
     */
    function publishIssue(
        uint256         newsletterId,
        bytes32         contentHash,
        string calldata preview,
        string calldata endpoint
    ) external {
        Newsletter storage nl = _newsletters[newsletterId];
        if (nl.publisher == address(0))                 revert NewsletterNotFound();
        if (nl.publisher != msg.sender)                 revert NotPublisher();
        if (!nl.active)                                 revert NewsletterNotActive();
        if (contentHash == bytes32(0))                  revert EmptyContentHash();
        if (bytes(preview).length > MAX_PREVIEW_LENGTH) revert PreviewTooLong();
        if (bytes(endpoint).length == 0)                revert EmptyEndpoint();
        if (_publishedHash[contentHash])                revert HashAlreadyPublished();

        // Effects
        uint256 issueNumber = _issueCount[newsletterId] + 1;
        _issueCount[newsletterId] = issueNumber;
        _publishedHash[contentHash] = true;

        _issues[newsletterId][issueNumber] = Issue({
            newsletterId: newsletterId,
            issueNumber:  issueNumber,
            contentHash:  contentHash,
            preview:      preview,
            endpoint:     endpoint,
            timestamp:    block.timestamp
        });

        emit IssuePublished(newsletterId, issueNumber, contentHash, preview, endpoint, block.timestamp);
    }

    /**
     * @notice Deactivate a newsletter. Publisher only. Prevents future issue publishing.
     */
    function deactivateNewsletter(uint256 newsletterId) external {
        Newsletter storage nl = _newsletters[newsletterId];
        if (nl.publisher == address(0))  revert NewsletterNotFound();
        if (nl.publisher != msg.sender)  revert NotPublisher();
        if (!nl.active)                  revert NewsletterNotActive();

        // Effects
        nl.active = false;

        emit NewsletterDeactivated(newsletterId, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getNewsletter(uint256 newsletterId)
        external
        view
        returns (Newsletter memory)
    {
        if (_newsletters[newsletterId].publisher == address(0)) revert NewsletterNotFound();
        return _newsletters[newsletterId];
    }

    function getIssue(uint256 newsletterId, uint256 issueNumber)
        external
        view
        returns (Issue memory)
    {
        if (_newsletters[newsletterId].publisher == address(0)) revert NewsletterNotFound();
        if (issueNumber == 0 || issueNumber > _issueCount[newsletterId])
            revert IssueNotFound();
        return _issues[newsletterId][issueNumber];
    }

    /**
     * @notice Returns all issues for a newsletter in order.
     */
    function getIssues(uint256 newsletterId)
        external
        view
        returns (Issue[] memory result)
    {
        if (_newsletters[newsletterId].publisher == address(0)) revert NewsletterNotFound();
        uint256 count = _issueCount[newsletterId];
        result = new Issue[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _issues[newsletterId][i + 1];
        }
    }

    function issueCount(uint256 newsletterId) external view returns (uint256) {
        return _issueCount[newsletterId];
    }

    function totalNewsletters() external view returns (uint256) {
        return _nextNewsletterId;
    }

    function hashPublished(bytes32 contentHash) external view returns (bool) {
        return _publishedHash[contentHash];
    }
}

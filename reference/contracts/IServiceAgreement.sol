// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IServiceAgreement
 * @notice Interface for bilateral agent-to-agent service agreements in ARC-402
 * STATUS: DRAFT — not audited, do not use in production
 */
interface IServiceAgreement {

    // ─── Types ───────────────────────────────────────────────────────────────

    enum Status { PROPOSED, ACCEPTED, FULFILLED, DISPUTED, CANCELLED }

    struct Agreement {
        uint256 id;
        address client;           // paying agent wallet
        address provider;         // delivering agent wallet
        string serviceType;       // e.g. "text-generation"
        string description;
        uint256 price;
        address token;            // ERC-20 address or address(0) for ETH
        uint256 deadline;         // unix timestamp
        bytes32 deliverablesHash; // keccak256 of expected deliverables spec
        Status status;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @notice Client proposes a service agreement, locking escrow
     * @param provider The agent wallet that will deliver the service
     * @param serviceType Short type tag (e.g. "text-generation")
     * @param description Human/agent-readable description
     * @param price Payment amount in wei (ETH) or token units
     * @param token ERC-20 token address, or address(0) for ETH
     * @param deadline Unix timestamp after which client may cancel if unfulfilled
     * @param deliverablesHash keccak256 of the expected deliverables spec
     * @return agreementId The new agreement's ID (starts at 1)
     */
    function propose(
        address provider,
        string calldata serviceType,
        string calldata description,
        uint256 price,
        address token,
        uint256 deadline,
        bytes32 deliverablesHash
    ) external payable returns (uint256 agreementId);

    /**
     * @notice Provider accepts a proposed agreement
     * @param agreementId The agreement to accept
     */
    function accept(uint256 agreementId) external;

    /**
     * @notice Provider marks the agreement fulfilled and claims escrow
     * @param agreementId The agreement to fulfill
     * @param actualDeliverablesHash keccak256 of what was actually delivered
     */
    function fulfill(uint256 agreementId, bytes32 actualDeliverablesHash) external;

    /**
     * @notice Client or provider raises a dispute (escrow stays locked)
     * @param agreementId The agreement to dispute
     * @param reason Human/agent-readable reason
     */
    function dispute(uint256 agreementId, string calldata reason) external;

    /**
     * @notice Client cancels a PROPOSED agreement and retrieves escrow
     * @param agreementId The agreement to cancel
     */
    function cancel(uint256 agreementId) external;

    /**
     * @notice Returns a full agreement struct
     * @param id The agreement ID
     */
    function getAgreement(uint256 id) external view returns (Agreement memory);
}

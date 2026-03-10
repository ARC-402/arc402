// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SettlementCoordinator
 * @notice Multi-Agent Settlement coordinator for ARC-402
 * STATUS: DRAFT — not audited, do not use in production
 */
contract SettlementCoordinator {
    enum ProposalStatus { PENDING, ACCEPTED, REJECTED, EXECUTED, EXPIRED }

    struct Proposal {
        bytes32 proposalId;
        address fromWallet;
        address toWallet;
        uint256 amount;
        bytes32 intentId;
        uint256 expiresAt;
        ProposalStatus status;
        string rejectionReason;
    }

    mapping(bytes32 => Proposal) private proposals;
    mapping(bytes32 => bool) private proposalExists;

    event ProposalCreated(bytes32 indexed proposalId, address indexed from, address indexed to, uint256 amount);
    event ProposalAccepted(bytes32 indexed proposalId);
    event ProposalRejected(bytes32 indexed proposalId, string reason);
    event ProposalExecuted(bytes32 indexed proposalId, uint256 amount);
    event ProposalExpired(bytes32 indexed proposalId);

    function propose(
        address fromWallet,
        address toWallet,
        uint256 amount,
        bytes32 intentId,
        uint256 expiresAt
    ) external returns (bytes32 proposalId) {
        proposalId = keccak256(abi.encodePacked(fromWallet, toWallet, amount, intentId, block.timestamp));
        require(!proposalExists[proposalId], "SettlementCoordinator: proposal exists");

        proposals[proposalId] = Proposal({
            proposalId: proposalId,
            fromWallet: fromWallet,
            toWallet: toWallet,
            amount: amount,
            intentId: intentId,
            expiresAt: expiresAt,
            status: ProposalStatus.PENDING,
            rejectionReason: ""
        });
        proposalExists[proposalId] = true;

        emit ProposalCreated(proposalId, fromWallet, toWallet, amount);
        return proposalId;
    }

    function accept(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.PENDING, "SettlementCoordinator: not pending");
        require(block.timestamp <= p.expiresAt, "SettlementCoordinator: expired");
        require(msg.sender == p.toWallet, "SettlementCoordinator: not recipient");

        p.status = ProposalStatus.ACCEPTED;
        emit ProposalAccepted(proposalId);
    }

    function reject(bytes32 proposalId, string calldata reason) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.PENDING, "SettlementCoordinator: not pending");
        require(msg.sender == p.toWallet, "SettlementCoordinator: not recipient");

        p.status = ProposalStatus.REJECTED;
        p.rejectionReason = reason;
        emit ProposalRejected(proposalId, reason);
    }

    function execute(bytes32 proposalId) external payable {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.ACCEPTED, "SettlementCoordinator: not accepted");
        require(block.timestamp <= p.expiresAt, "SettlementCoordinator: expired");
        require(msg.sender == p.fromWallet, "SettlementCoordinator: not sender");
        require(msg.value == p.amount, "SettlementCoordinator: wrong amount");

        p.status = ProposalStatus.EXECUTED;

        emit ProposalExecuted(proposalId, p.amount);
        (bool success,) = p.toWallet.call{value: p.amount}("");
        require(success, "SettlementCoordinator: transfer failed");
    }

    function getProposal(bytes32 proposalId) external view returns (
        address fromWallet,
        address toWallet,
        uint256 amount,
        bytes32 intentId,
        uint256 expiresAt,
        ProposalStatus status,
        string memory rejectionReason
    ) {
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        Proposal storage p = proposals[proposalId];
        return (p.fromWallet, p.toWallet, p.amount, p.intentId, p.expiresAt, p.status, p.rejectionReason);
    }

    function checkExpiry(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.PENDING, "SettlementCoordinator: not pending");
        require(block.timestamp > p.expiresAt, "SettlementCoordinator: not expired");
        p.status = ProposalStatus.EXPIRED;
        emit ProposalExpired(proposalId);
    }
}

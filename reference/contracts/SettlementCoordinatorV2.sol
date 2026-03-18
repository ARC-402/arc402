// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SettlementCoordinatorV2
 * @notice V2 of the ARC-402 multi-agent settlement coordinator.
 *         Adds proposeFromWallet() which absorbs the MAS settlement proposal
 *         logic previously in ARC402Wallet.proposeMASSettlement().
 *
 *         Machine keys OR the wallet itself may call proposeFromWallet() directly,
 *         enabling settlement proposals without an owner-signed wallet transaction.
 *
 * NOTE: V2 re-implements SettlementCoordinator with `internal` storage rather than
 *       inheriting it. Solidity does not allow overriding non-virtual functions, and
 *       the parent uses `private` mappings that child contracts cannot access.
 *       V2 therefore stands alone while providing identical external function
 *       signatures and error strings for full backward compatibility.
 */

/// @dev Minimal wallet interface needed by proposeFromWallet().
interface IARC402WalletV2 {
    function owner() external view returns (address);
    function frozen() external view returns (bool);
    function contextOpen() external view returns (bool);
    function authorizedMachineKeys(address key) external view returns (bool);
    function verifyAndConsumeAttestation(bytes32 attestationId, address recipient, uint256 amount, string calldata category) external;
}

contract SettlementCoordinatorV2 {
    using SafeERC20 for IERC20;

    enum ProposalStatus { PENDING, ACCEPTED, REJECTED, EXECUTED, EXPIRED }

    /// @notice Maximum time a proposal may remain ACCEPTED before execution.
    uint256 public constant EXECUTION_WINDOW = 7 days;

    struct Proposal {
        bytes32 proposalId;
        address fromWallet;
        address toWallet;
        uint256 amount;
        address token;          // address(0) for ETH, token address for ERC-20
        bytes32 intentId;
        uint256 expiresAt;
        uint256 acceptedAt;     // set when status moves to ACCEPTED
        ProposalStatus status;
        string rejectionReason;
    }

    // internal (not private) so that proposeFromWallet() can use _createProposal().
    mapping(bytes32 => Proposal) internal proposals;
    mapping(bytes32 => bool) internal proposalExists;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ProposalCreated(bytes32 indexed proposalId, address indexed from, address indexed to, uint256 amount, address token);
    event ProposalAccepted(bytes32 indexed proposalId);
    event ProposalRejected(bytes32 indexed proposalId, string reason);
    event ProposalExecuted(bytes32 indexed proposalId, uint256 amount);
    event ProposalExpired(bytes32 indexed proposalId);

    /// @notice Emitted when a settlement is proposed via proposeFromWallet().
    event SettlementProposed(address indexed fromWallet, address indexed recipientWallet, uint256 amount, bytes32 attestationId);

    // ─── V1-compatible Settlement Functions ──────────────────────────────────

    function propose(
        address fromWallet,
        address toWallet,
        uint256 amount,
        address token,
        bytes32 intentId,
        uint256 expiresAt
    ) external returns (bytes32 proposalId) {
        require(msg.sender == fromWallet, "SC: caller must be fromWallet");
        return _createProposal(fromWallet, toWallet, amount, token, intentId, expiresAt);
    }

    function accept(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.PENDING, "SettlementCoordinator: not pending");
        require(block.timestamp <= p.expiresAt, "SettlementCoordinator: expired");
        require(msg.sender == p.toWallet, "SettlementCoordinator: not recipient");

        p.status = ProposalStatus.ACCEPTED;
        p.acceptedAt = block.timestamp;
        emit ProposalAccepted(proposalId);
    }

    function expireAccepted(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.ACCEPTED, "SettlementCoordinator: not accepted");
        require(
            block.timestamp > p.acceptedAt + EXECUTION_WINDOW,
            "SettlementCoordinator: execution window open"
        );
        p.status = ProposalStatus.EXPIRED;
        emit ProposalExpired(proposalId);
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
        require(
            block.timestamp <= p.acceptedAt + EXECUTION_WINDOW,
            "SettlementCoordinator: execution window expired"
        );
        require(msg.sender == p.fromWallet, "SettlementCoordinator: not sender");

        p.status = ProposalStatus.EXECUTED;
        emit ProposalExecuted(proposalId, p.amount);

        if (p.token == address(0)) {
            require(msg.value == p.amount, "SettlementCoordinator: wrong amount");
            (bool success,) = p.toWallet.call{value: p.amount}("");
            require(success, "SettlementCoordinator: transfer failed");
        } else {
            require(msg.value == 0, "SettlementCoordinator: ETH not accepted for token proposal");
            // slither-disable-next-line arbitrary-from-in-transferFrom
            IERC20(p.token).safeTransferFrom(msg.sender, p.toWallet, p.amount);
        }
    }

    function getProposal(bytes32 proposalId) external view returns (
        address fromWallet,
        address toWallet,
        uint256 amount,
        address token,
        bytes32 intentId,
        uint256 expiresAt,
        uint256 acceptedAt,
        ProposalStatus status,
        string memory rejectionReason
    ) {
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        Proposal storage p = proposals[proposalId];
        return (p.fromWallet, p.toWallet, p.amount, p.token, p.intentId, p.expiresAt, p.acceptedAt, p.status, p.rejectionReason);
    }

    function checkExpiry(bytes32 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(proposalExists[proposalId], "SettlementCoordinator: not found");
        require(p.status == ProposalStatus.PENDING, "SettlementCoordinator: not pending");
        require(block.timestamp > p.expiresAt, "SettlementCoordinator: not expired");
        p.status = ProposalStatus.EXPIRED;
        emit ProposalExpired(proposalId);
    }

    // ─── V2: proposeFromWallet ────────────────────────────────────────────────

    /**
     * @notice Propose a MAS settlement on behalf of a wallet.
     *         Absorbs the logic from ARC402Wallet.proposeMASSettlement():
     *           - attestation verify + consume
     *           - PolicyEngine validateSpend + recordSpend
     *           - proposal creation
     *
     * @param walletAddress   Wallet initiating the settlement.
     *                        Caller must be the wallet itself OR one of its authorizedMachineKeys.
     * @param recipientWallet Recipient ARC-402 wallet address.
     * @param amount          Settlement amount in wei (ETH).
     * @param category        Spend category for PolicyEngine governance.
     * @param attestationId   Intent attestation ID (must already be attested by the wallet).
     */
    function proposeFromWallet(
        address walletAddress,
        address recipientWallet,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external {
        IARC402WalletV2 wallet = IARC402WalletV2(walletAddress);

        // Auth: caller must be the wallet itself OR an authorized machine key on the wallet
        require(
            msg.sender == walletAddress || wallet.authorizedMachineKeys(msg.sender),
            "SCv2: not authorized"
        );

        // Validate wallet registration and circuit-breaker state
        require(wallet.owner() != address(0), "SCv2: wallet not registered");
        require(!wallet.frozen(), "SCv2: wallet frozen");
        require(wallet.contextOpen(), "SCv2: no open context");

        // Verify intent attestation, validate policy, and record spend — all via the wallet.
        // verifyAndConsumeAttestation() enforces that only this coordinator can call it;
        // the wallet is msg.sender when it calls PolicyEngine, satisfying PolicyEngine's
        // "msg.sender == wallet" access-control requirement.
        wallet.verifyAndConsumeAttestation(attestationId, recipientWallet, amount, category);

        emit SettlementProposed(walletAddress, recipientWallet, amount, attestationId);

        // Create the settlement proposal (ETH, 1-day expiry)
        _createProposal(
            walletAddress,
            recipientWallet,
            amount,
            address(0),
            attestationId,
            block.timestamp + 1 days
        );
    }

    // ─── Internal Helper ─────────────────────────────────────────────────────

    function _createProposal(
        address fromWallet,
        address toWallet,
        uint256 amount,
        address token,
        bytes32 intentId,
        uint256 expiresAt
    ) internal returns (bytes32 proposalId) {
        proposalId = keccak256(abi.encodePacked(fromWallet, toWallet, amount, token, intentId, block.timestamp));
        require(!proposalExists[proposalId], "SettlementCoordinator: proposal exists");

        proposals[proposalId] = Proposal({
            proposalId: proposalId,
            fromWallet: fromWallet,
            toWallet: toWallet,
            amount: amount,
            token: token,
            intentId: intentId,
            expiresAt: expiresAt,
            acceptedAt: 0,
            status: ProposalStatus.PENDING,
            rejectionReason: ""
        });
        proposalExists[proposalId] = true;

        emit ProposalCreated(proposalId, fromWallet, toWallet, amount, token);
        return proposalId;
    }
}

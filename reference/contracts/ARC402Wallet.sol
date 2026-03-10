// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPolicyEngine.sol";
import "./ITrustRegistry.sol";
import "./IIntentAttestation.sol";

/**
 * @title ARC402Wallet
 * @notice Reference implementation of an ARC-402 agentic wallet
 * @dev ERC-4337 compatible. Implements Policy, Context, Trust, and Intent primitives.
 * STATUS: DRAFT — not audited, do not use in production
 */
contract ARC402Wallet {
    // ─── State ───────────────────────────────────────────────────────────────

    address public immutable owner;
    IPolicyEngine public immutable policyEngine;
    ITrustRegistry public immutable trustRegistry;
    IIntentAttestation public immutable intentAttestation;

    bytes32 public activePolicyId;
    bytes32 public activeContextId;
    string public activeTaskType;
    bool public contextOpen;
    uint256 public contextOpenedAt;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ContextOpened(bytes32 indexed contextId, string taskType, uint256 timestamp);
    event ContextClosed(bytes32 indexed contextId, uint256 timestamp);
    event SpendExecuted(address indexed recipient, uint256 amount, string category, bytes32 attestationId);
    event SpendRejected(address indexed recipient, uint256 amount, string reason);
    event PolicyUpdated(bytes32 newPolicyId);
    event SettlementProposed(address indexed recipientWallet, uint256 amount, bytes32 attestationId);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "ARC402: not owner");
        _;
    }

    modifier requireOpenContext() {
        require(contextOpen, "ARC402: no active context");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _policyEngine,
        address _trustRegistry,
        address _intentAttestation
    ) {
        owner = msg.sender;
        policyEngine = IPolicyEngine(_policyEngine);
        trustRegistry = ITrustRegistry(_trustRegistry);
        intentAttestation = IIntentAttestation(_intentAttestation);
        trustRegistry.initWallet(address(this));
    }

    // ─── Context Management ──────────────────────────────────────────────────

    function openContext(bytes32 contextId, string calldata taskType) external onlyOwner {
        require(!contextOpen, "ARC402: context already open");
        activeContextId = contextId;
        activeTaskType = taskType;
        contextOpen = true;
        contextOpenedAt = block.timestamp;
        emit ContextOpened(contextId, taskType, block.timestamp);
    }

    function closeContext() external onlyOwner requireOpenContext {
        bytes32 closedContextId = activeContextId;
        activeContextId = bytes32(0);
        activeTaskType = "";
        contextOpen = false;
        emit ContextClosed(closedContextId, block.timestamp);
        trustRegistry.recordSuccess(address(this));
    }

    // ─── Spend Execution ─────────────────────────────────────────────────────

    function executeSpend(
        address payable recipient,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external onlyOwner requireOpenContext {
        require(recipient != address(0), "ARC402: zero address recipient");

        // 1. Verify intent attestation exists and is valid
        require(
            intentAttestation.verify(attestationId, address(this)),
            "ARC402: invalid intent attestation"
        );

        // 2. Validate against policy
        (bool valid, string memory reason) = policyEngine.validateSpend(
            address(this),
            category,
            amount,
            activeContextId
        );

        if (!valid) {
            emit SpendRejected(recipient, amount, reason);
            // slither-disable-next-line reentrancy-events
            trustRegistry.recordAnomaly(address(this));
            revert(reason);
        }

        // 3. Execute transfer (emit before external call per CEI pattern)
        emit SpendExecuted(recipient, amount, category, attestationId);
        (bool success,) = recipient.call{value: amount}("");
        require(success, "ARC402: transfer failed");
    }

    // ─── Multi-Agent Settlement ───────────────────────────────────────────────

    function proposeMASSettlement(
        address recipientWallet,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external onlyOwner requireOpenContext {
        require(
            intentAttestation.verify(attestationId, address(this)),
            "ARC402: invalid intent attestation"
        );
        (bool valid, string memory reason) = policyEngine.validateSpend(
            address(this),
            category,
            amount,
            activeContextId
        );
        require(valid, reason);
        emit SettlementProposed(recipientWallet, amount, attestationId);
    }

    // ─── Policy Management ───────────────────────────────────────────────────

    function updatePolicy(bytes32 newPolicyId) external onlyOwner {
        activePolicyId = newPolicyId;
        emit PolicyUpdated(newPolicyId);
    }

    // ─── Trust Query ─────────────────────────────────────────────────────────

    function getTrustScore() external view returns (uint256) {
        return trustRegistry.getScore(address(this));
    }

    // ─── Context Query ───────────────────────────────────────────────────────

    function getActiveContext() external view returns (bytes32, string memory, uint256, bool) {
        return (activeContextId, activeTaskType, contextOpenedAt, contextOpen);
    }

    // ─── Receive ─────────────────────────────────────────────────────────────

    receive() external payable {}
}

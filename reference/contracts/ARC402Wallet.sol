// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPolicyEngine.sol";
import "./ITrustRegistry.sol";
import "./IIntentAttestation.sol";
import "./ARC402Registry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ARC402Wallet
 * @notice Reference implementation of an ARC-402 agentic wallet
 * @dev ERC-4337 compatible. Implements Policy, Context, Trust, and Intent primitives.
 *      Supports both ETH and ERC-20 (e.g. USDC) governed spending for x402 integration.
 *      Registry-based upgrade: owner can point wallet at a new ARC402Registry to opt into
 *      new infrastructure versions. Nobody else can force an upgrade.
 * STATUS: DRAFT — not audited, do not use in production
 */
contract ARC402Wallet {
    using SafeERC20 for IERC20;

    // ─── State ───────────────────────────────────────────────────────────────

    address public immutable owner;
    ARC402Registry public registry;  // NOT immutable — can be updated by owner

    bytes32 public activePolicyId;
    bytes32 public activeContextId;
    string public activeTaskType;
    bool public contextOpen;
    uint256 public contextOpenedAt;

    // ─── Events ──────────────────────────────────────────────────────────────

    event RegistryUpdated(address oldRegistry, address newRegistry);
    event ContextOpened(bytes32 indexed contextId, string taskType, uint256 timestamp);
    event ContextClosed(bytes32 indexed contextId, uint256 timestamp);
    event SpendExecuted(address indexed recipient, uint256 amount, string category, bytes32 attestationId);
    event SpendRejected(address indexed recipient, uint256 amount, string reason);
    event TokenSpendExecuted(address indexed token, address indexed recipient, uint256 amount, string category, bytes32 attestationId);
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

    constructor(address _registry) {
        owner = msg.sender;
        registry = ARC402Registry(_registry);
        _trustRegistry().initWallet(address(this));
    }

    // ─── Registry Upgrade (owner-controlled) ─────────────────────────────────

    function setRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "ARC402: zero registry");
        address old = address(registry);
        registry = ARC402Registry(newRegistry);
        emit RegistryUpdated(old, newRegistry);
    }

    // ─── Internal Contract Accessors ─────────────────────────────────────────

    function _policyEngine() internal view returns (IPolicyEngine) {
        return IPolicyEngine(registry.policyEngine());
    }

    function _trustRegistry() internal view returns (ITrustRegistry) {
        return ITrustRegistry(registry.trustRegistry());
    }

    function _intentAttestation() internal view returns (IIntentAttestation) {
        return IIntentAttestation(registry.intentAttestation());
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
        _trustRegistry().recordSuccess(address(this));
    }

    // ─── ETH Spend Execution ─────────────────────────────────────────────────

    function executeSpend(
        address payable recipient,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external onlyOwner requireOpenContext {
        require(recipient != address(0), "ARC402: zero address recipient");

        // 1. Verify intent attestation exists and is valid
        require(
            _intentAttestation().verify(attestationId, address(this)),
            "ARC402: invalid intent attestation"
        );

        // 2. Validate against policy
        (bool valid, string memory reason) = _policyEngine().validateSpend(
            address(this),
            category,
            amount,
            activeContextId
        );

        if (!valid) {
            emit SpendRejected(recipient, amount, reason);
            // slither-disable-next-line reentrancy-events
            _trustRegistry().recordAnomaly(address(this));
            revert(reason);
        }

        // 3. Execute transfer (emit before external call per CEI pattern)
        emit SpendExecuted(recipient, amount, category, attestationId);
        (bool success,) = recipient.call{value: amount}("");
        require(success, "ARC402: transfer failed");
    }

    // ─── ERC-20 Token Spend Execution (x402 / USDC) ──────────────────────────

    /**
     * @notice Execute a governed ERC-20 token spend (e.g. USDC for x402 payments)
     * @param token ERC-20 token address (e.g. USDC)
     * @param recipient Payment recipient
     * @param amount Token amount (in token decimals)
     * @param category Policy category for validation
     * @param attestationId Pre-created intent attestation
     */
    function executeTokenSpend(
        address token,
        address recipient,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external onlyOwner requireOpenContext {
        require(recipient != address(0), "ARC402: zero address recipient");
        require(token != address(0), "ARC402: zero token address");

        // 1. Verify intent attestation
        require(_intentAttestation().verify(attestationId, address(this)), "ARC402: invalid attestation");

        // 2. Validate policy
        (bool valid, string memory reason) = _policyEngine().validateSpend(
            address(this), category, amount, activeContextId
        );
        if (!valid) {
            emit SpendRejected(recipient, amount, reason);
            _trustRegistry().recordAnomaly(address(this));
            revert(reason);
        }

        // 3. Emit BEFORE transfer (CEI pattern)
        emit TokenSpendExecuted(token, recipient, amount, category, attestationId);

        // 4. Execute ERC-20 transfer
        IERC20(token).safeTransfer(recipient, amount);
    }

    // ─── Multi-Agent Settlement ───────────────────────────────────────────────

    function proposeMASSettlement(
        address recipientWallet,
        uint256 amount,
        string calldata category,
        bytes32 attestationId
    ) external onlyOwner requireOpenContext {
        require(
            _intentAttestation().verify(attestationId, address(this)),
            "ARC402: invalid intent attestation"
        );
        (bool valid, string memory reason) = _policyEngine().validateSpend(
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
        return _trustRegistry().getScore(address(this));
    }

    // ─── Context Query ───────────────────────────────────────────────────────

    function getActiveContext() external view returns (bytes32, string memory, uint256, bool) {
        return (activeContextId, activeTaskType, contextOpenedAt, contextOpen);
    }

    // ─── Receive ─────────────────────────────────────────────────────────────

    receive() external payable {}
}

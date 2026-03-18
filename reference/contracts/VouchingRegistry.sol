// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ITrustRegistryV3.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title VouchingRegistry
 * @notice Stake-backed peer vouching for cold-start trust bootstrapping in ARC-402.
 *
 * STATUS: Reference implementation — Spec 28 §Cold Start §Vouching
 *
 * Mechanism:
 *   A high-trust agent (score > 200) can stake a minimum of 0.01 ETH to introduce
 *   a new agent. In return the new agent receives a one-time trust score boost:
 *
 *     vouchedBoost = min(vouchingAgentScore × 10 / 100, 50)
 *
 *   The boost is applied immediately to TrustRegistryV3 via applyBoost().
 *   The vouching agent may hold only one active vouch at a time.
 *
 *   On revocation:
 *     • Clean record  → stake returned to voucher; boost reversed on TrustRegistryV3.
 *     • Anomaly marked (by authorised updater) → stake slashed (held in contract);
 *       boost stays reversed (penalty already applied via recordAnomaly flow).
 *
 * Security fixes applied:
 *   B-1  Vouch cycling / unlimited boost inflation — lifetime boost cap + reverseBoost on revoke.
 *   B-2  revokeVouch reentrancy — ReentrancyGuard on vouch() and revokeVouch().
 *   R-2  withdrawSlashed drains active stake — slashedBalance accounting.
 *   R-3  reportAnomaly front-run bypass — MIN_VOUCH_LOCK (7-day lock period).
 *
 * @dev VouchingRegistry must be added as an authorised updater on TrustRegistryV3.
 */
contract VouchingRegistry is ReentrancyGuard, Ownable2Step {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MIN_STAKE          = 0.01 ether;
    uint256 public constant MIN_VOUCHER_SCORE  = 200;
    uint256 public constant MAX_BOOST          = 50;
    uint256 public constant BOOST_BPS          = 10; // 10/100 = 10% of voucher score

    /// @notice B-1: A wallet can receive at most 50 cumulative boost points via vouching.
    uint256 public constant MAX_LIFETIME_BOOST = 50;

    /// @notice R-3: Voucher cannot revoke within 7 days of vouching (front-run prevention).
    uint256 public constant MIN_VOUCH_LOCK     = 7 days;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct VouchState {
        address voucher;        // who vouched
        uint256 stakeAmount;    // ETH staked (wei)
        uint256 boost;          // boost applied to newAgent's score
        uint256 createdAt;      // block.timestamp of vouch
        bool    active;         // false once revoked/slashed
        bool    anomalyReported;// set by authorised updater before revocation
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice TrustRegistryV3 used to read voucher scores and apply boosts.
    ITrustRegistryV3 public immutable trustRegistry;

    /// @notice Who vouched for each new agent.
    mapping(address => VouchState) public vouches;

    /// @notice Active vouch target per vouching agent (max one at a time).
    /// @dev Cleared when vouch is revoked or slashed.
    mapping(address => address) public activeVouchOf;

    /// @notice Addresses authorised to call reportAnomaly / slash paths.
    mapping(address => bool) public isAuthorizedUpdater;

    /// @notice B-1: Cumulative boost points received by each wallet via vouching.
    mapping(address => uint256) public totalBoostReceived;

    /// @notice R-2: ETH balance accumulated from slashed stakes.
    uint256 public slashedBalance;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VouchCreated(
        address indexed voucher,
        address indexed newAgent,
        uint256 stakeAmount,
        uint256 boost
    );

    event VouchRevoked(
        address indexed voucher,
        address indexed newAgent,
        uint256 stakeReturned
    );

    event VouchSlashed(
        address indexed voucher,
        address indexed newAgent,
        uint256 stakeSlashed
    );

    event AnomalyReported(address indexed newAgent);
    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyUpdater() {
        require(isAuthorizedUpdater[msg.sender], "VouchingRegistry: not authorized updater");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _trustRegistry Address of TrustRegistryV3.
    ///        This contract must be added as an authorised updater there to apply boosts.
    constructor(address _trustRegistry) Ownable(msg.sender) {
        require(_trustRegistry != address(0), "VouchingRegistry: zero address");
        trustRegistry = ITrustRegistryV3(_trustRegistry);
        isAuthorizedUpdater[msg.sender] = true;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function addUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = true;
        emit UpdaterAdded(updater);
    }

    function removeUpdater(address updater) external onlyOwner {
        isAuthorizedUpdater[updater] = false;
        emit UpdaterRemoved(updater);
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /**
     * @notice Stake ETH to vouch for a new agent. Applies a trust score boost to newAgent.
     *
     * Requirements:
     *   - msg.value >= MIN_STAKE (0.01 ETH)
     *   - Caller's effective trust score > 200
     *   - Caller has no other active vouch
     *   - newAgent has no existing active vouch
     *   - newAgent != msg.sender
     *   - newAgent has not yet received its lifetime boost cap (MAX_LIFETIME_BOOST)
     *
     * @param newAgent     The new agent to vouch for.
     * @param stakeAmount  Must equal msg.value (explicit parameter for clarity; enforced).
     */
    function vouch(address newAgent, uint256 stakeAmount) external payable nonReentrant {
        require(newAgent != address(0), "VouchingRegistry: zero address");
        require(newAgent != msg.sender, "VouchingRegistry: cannot self-vouch");
        require(msg.value == stakeAmount, "VouchingRegistry: msg.value mismatch");
        require(msg.value >= MIN_STAKE, "VouchingRegistry: stake below minimum");
        require(activeVouchOf[msg.sender] == address(0), "VouchingRegistry: voucher has active vouch");
        require(!vouches[newAgent].active, "VouchingRegistry: newAgent already vouched");

        uint256 voucherScore = trustRegistry.getEffectiveScore(msg.sender);
        require(voucherScore > MIN_VOUCHER_SCORE, "VouchingRegistry: voucher score too low");

        // boost = min(voucherScore × 10 / 100, 50)
        uint256 boost = voucherScore * BOOST_BPS / 100;
        if (boost > MAX_BOOST) boost = MAX_BOOST;

        // B-1: Enforce lifetime boost cap — prevent cycling attacks.
        require(
            totalBoostReceived[newAgent] + boost <= MAX_LIFETIME_BOOST,
            "VouchingRegistry: lifetime boost cap reached"
        );

        vouches[newAgent] = VouchState({
            voucher:         msg.sender,
            stakeAmount:     msg.value,
            boost:           boost,
            createdAt:       block.timestamp,
            active:          true,
            anomalyReported: false
        });

        activeVouchOf[msg.sender] = newAgent;

        // B-1: Track cumulative boost received.
        totalBoostReceived[newAgent] += boost;

        // Apply the boost to the new agent's trust score.
        // Requires this contract to be an authorised updater on TrustRegistryV3.
        ITrustRegistryV3Extended(address(trustRegistry)).applyBoost(newAgent, boost);

        emit VouchCreated(msg.sender, newAgent, msg.value, boost);
    }

    /**
     * @notice Vouching agent revokes their vouch for newAgent.
     *
     * - If no anomaly has been reported: stake is returned to the voucher; boost is reversed.
     * - If anomaly was reported by an authorised updater: stake is slashed (held in contract);
     *   boost stays reversed (penalty already in effect).
     *
     * @param newAgent The agent whose vouch to revoke.
     */
    function revokeVouch(address newAgent) external nonReentrant {
        VouchState storage v = vouches[newAgent];
        require(v.active, "VouchingRegistry: no active vouch");
        require(v.voucher == msg.sender, "VouchingRegistry: not the voucher");

        // R-3: Enforce minimum lock period to prevent mempool front-running of reportAnomaly.
        require(
            block.timestamp >= v.createdAt + MIN_VOUCH_LOCK,
            "VouchingRegistry: vouch is locked"
        );

        v.active = false;
        activeVouchOf[msg.sender] = address(0);

        if (v.anomalyReported) {
            // R-2: Track slashed ETH separately so withdrawSlashed cannot drain active stake.
            slashedBalance += v.stakeAmount;
            emit VouchSlashed(msg.sender, newAgent, v.stakeAmount);
            // Stake is retained by the contract (slashed). Owner may withdraw via withdrawSlashed.
        } else {
            uint256 amount = v.stakeAmount;

            // B-1: Reverse the boost on clean revoke — boost cycling no longer profitable.
            ITrustRegistryV3Extended(address(trustRegistry)).reverseBoost(newAgent, v.boost);

            // Transfer after state is fully updated (CEI pattern).
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "VouchingRegistry: stake return failed");
            emit VouchRevoked(msg.sender, newAgent, amount);
        }
    }

    /**
     * @notice Mark a vouched new agent as having an anomaly, so that the voucher's stake
     *         will be slashed when they call revokeVouch.
     *
     * @dev Called by authorised updaters (e.g., ServiceAgreement, DisputeModule).
     * @param newAgent The agent with the anomaly.
     */
    function reportAnomaly(address newAgent) external onlyUpdater {
        VouchState storage v = vouches[newAgent];
        require(v.active, "VouchingRegistry: no active vouch");
        v.anomalyReported = true;
        emit AnomalyReported(newAgent);
    }

    /**
     * @notice Withdraw accumulated slashed stakes to a recipient address.
     * @dev Only callable by owner. Slashed ETH accumulates in the contract.
     */
    function withdrawSlashed(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "VouchingRegistry: zero address");
        // R-2: Only allow withdrawal of the tracked slashed balance.
        require(amount <= slashedBalance, "VouchingRegistry: insufficient slashed balance");
        slashedBalance -= amount;
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "VouchingRegistry: withdrawal failed");
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Returns the trust score boost that was applied to newAgent via vouching.
    ///         Returns 0 if no vouch exists (active or historical).
    function getVouchedBoost(address newAgent) external view returns (uint256) {
        return vouches[newAgent].boost;
    }

    /// @notice Returns the address that vouched for newAgent.
    ///         Returns address(0) if no vouch exists.
    function getVoucher(address newAgent) external view returns (address) {
        return vouches[newAgent].voucher;
    }
}

/**
 * @dev Extended interface for ITrustRegistryV3 to call applyBoost and reverseBoost.
 *      The actual implementation must be present on the deployed TrustRegistryV3.
 */
interface ITrustRegistryV3Extended is ITrustRegistryV3 {
    function applyBoost(address wallet, uint256 boost) external;
    function reverseBoost(address wallet, uint256 amount) external;
}

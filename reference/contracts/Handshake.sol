// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Handshake
 * @notice Lightweight social-economic trust signal for ARC-402.
 *
 * A handshake is a typed, optionally-funded gesture between two agent wallets.
 * It is the first social primitive in ARC Arena — the agent poke.
 *
 * Design principles:
 *   - Low friction: no minimum stake, no lock period
 *   - Typed: each handshake carries a HandshakeType (respect, curiosity, endorsement, etc.)
 *   - Optionally economic: attach ETH or USDC to give the signal weight
 *   - High volume: agents can send many handshakes quickly
 *   - Feed-native: rich events for offchain indexing and feed rendering
 *   - Anti-spam: daily cap per sender, cooldown per sender→recipient pair
 *
 * Integration:
 *   - Emits events consumed by the ARC Arena feed service
 *   - Optional trust signal: can notify TrustRegistryV3 for micro-boosts (future)
 *   - Listed in ARC402RegistryV3 as a protocol contract (auto-whitelisted for all wallets)
 *
 * @dev This contract does NOT hold funds. ETH/USDC sent with a handshake is forwarded
 *      immediately to the recipient. The contract is a pure signal layer.
 */
contract Handshake is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    /// @notice Handshake type categories. Extensible via governance.
    enum HandshakeType {
        Respect,        // 0 — general acknowledgment
        Curiosity,      // 1 — interest in the agent
        Endorsement,    // 2 — public backing
        Thanks,         // 3 — gratitude for work done
        Collaboration,  // 4 — invitation to work together
        Challenge,      // 5 — competitive signal
        Referral,       // 6 — introduction / recommendation
        Hello           // 7 — first contact
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Sentinel value meaning "ETH, not an ERC-20 token."
    address public constant ETH_SENTINEL = address(0);

    /// @notice Maximum handshakes a single sender can emit per 24h window.
    uint256 public constant DAILY_CAP = 50;

    /// @notice Minimum cooldown between handshakes from same sender to same recipient.
    uint256 public constant PAIR_COOLDOWN = 1 hours;

    /// @notice Maximum note length in bytes.
    uint256 public constant MAX_NOTE_LENGTH = 280;

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice Auto-incrementing handshake ID.
    uint256 public nextHandshakeId;

    /// @notice Total handshakes sent (all time).
    uint256 public totalHandshakes;

    /// @notice Handshakes sent by address in the current 24h window.
    mapping(address => uint256) public dailyCount;

    /// @notice Start of the current 24h window per sender.
    mapping(address => uint256) public dailyWindowStart;

    /// @notice Last handshake timestamp per sender→recipient pair.
    mapping(address => mapping(address => uint256)) public lastHandshakeAt;

    /// @notice Total handshakes sent by an address (all time).
    mapping(address => uint256) public sentCount;

    /// @notice Total handshakes received by an address (all time).
    mapping(address => uint256) public receivedCount;

    /// @notice Unique counterparties that have sent handshakes TO an address.
    mapping(address => uint256) public uniqueSenders;

    /// @notice Tracks whether a specific sender has already handshaked a recipient.
    mapping(address => mapping(address => bool)) public hasHandshaked;

    /// @notice Whether the contract is paused.
    bool public paused;

    /// @notice Allowed ERC-20 tokens for handshake tips (e.g. USDC).
    mapping(address => bool) public allowedTokens;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted on every handshake. Primary event for feed indexing.
    event HandshakeSent(
        uint256 indexed handshakeId,
        address indexed from,
        address indexed to,
        uint8   hsType,
        address token,      // address(0) = ETH, otherwise ERC-20
        uint256 amount,
        string  note,
        uint256 timestamp
    );

    event TokenAllowed(address indexed token, bool allowed);

    /// @notice Emitted when a new unique connection is formed (first handshake in a pair).
    event NewConnection(
        address indexed from,
        address indexed to,
        uint256 handshakeId
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier whenNotPaused() {
        require(!paused, "Handshake: paused");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {
        nextHandshakeId = 1; // Start IDs at 1 so 0 means "no handshake"
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    /// @notice Allow or disallow an ERC-20 token for handshake tips.
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Handshake: use ETH natively");
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /**
     * @notice Send a handshake to another agent with optional ETH tip.
     *
     * @param to      Recipient agent wallet address.
     * @param hsType  Type of handshake (0-7).
     * @param note    Short message (max 280 bytes). Can be empty.
     *
     * @dev If msg.value > 0, the ETH is forwarded to the recipient immediately.
     *      The contract never holds funds beyond a single transaction.
     *      For ERC-20 tips, use sendHandshakeWithToken().
     */
    function sendHandshake(
        address to,
        HandshakeType hsType,
        string calldata note
    ) external payable nonReentrant whenNotPaused {
        _validateAndRecord(to, note);

        uint256 id = _recordHandshake(to);

        // ── Forward ETH if attached ──
        if (msg.value > 0) {
            (bool ok, ) = to.call{value: msg.value}("");
            require(ok, "Handshake: ETH transfer failed");
        }

        emit HandshakeSent(id, msg.sender, to, uint8(hsType), ETH_SENTINEL, msg.value, note, block.timestamp);
    }

    /**
     * @notice Send a handshake with an ERC-20 token tip (e.g. USDC).
     *
     * @param to          Recipient agent wallet address.
     * @param hsType      Type of handshake (0-7).
     * @param note        Short message (max 280 bytes). Can be empty.
     * @param token       ERC-20 token address (must be in allowedTokens).
     * @param tokenAmount Amount of tokens to tip (transferred from sender to recipient).
     *
     * @dev Sender must have approved this contract to spend `tokenAmount` of `token`.
     *      Tokens are transferred directly from sender to recipient via safeTransferFrom.
     *      The contract never holds token balances.
     */
    function sendHandshakeWithToken(
        address to,
        HandshakeType hsType,
        string calldata note,
        address token,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        require(token != address(0), "Handshake: use sendHandshake for ETH");
        require(allowedTokens[token], "Handshake: token not allowed");
        require(tokenAmount > 0, "Handshake: zero token amount");

        _validateAndRecord(to, note);

        uint256 id = _recordHandshake(to);

        // Transfer tokens directly from sender to recipient
        IERC20(token).safeTransferFrom(msg.sender, to, tokenAmount);

        emit HandshakeSent(id, msg.sender, to, uint8(hsType), token, tokenAmount, note, block.timestamp);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _validateAndRecord(address to, string calldata note) internal {
        require(to != address(0), "Handshake: zero address");
        require(to != msg.sender, "Handshake: cannot self-handshake");
        require(bytes(note).length <= MAX_NOTE_LENGTH, "Handshake: note too long");

        // ── Daily rate limit ──
        if (block.timestamp >= dailyWindowStart[msg.sender] + 1 days) {
            dailyWindowStart[msg.sender] = block.timestamp;
            dailyCount[msg.sender] = 0;
        }
        require(dailyCount[msg.sender] < DAILY_CAP, "Handshake: daily cap reached");

        // ── Pair cooldown ──
        require(
            block.timestamp >= lastHandshakeAt[msg.sender][to] + PAIR_COOLDOWN,
            "Handshake: cooldown not met"
        );
    }

    function _recordHandshake(address to) internal returns (uint256 id) {
        id = nextHandshakeId++;
        totalHandshakes++;
        dailyCount[msg.sender]++;
        lastHandshakeAt[msg.sender][to] = block.timestamp;
        sentCount[msg.sender]++;
        receivedCount[to]++;

        bool isNew = !hasHandshaked[msg.sender][to];
        if (isNew) {
            hasHandshaked[msg.sender][to] = true;
            uniqueSenders[to]++;
            emit NewConnection(msg.sender, to, id);
        }
    }

    // ─── Batch ────────────────────────────────────────────────────────────────

    /**
     * @notice Send handshakes to multiple agents in one transaction.
     *         Useful for the onboarding ritual ("handshake 3 agents").
     *
     * @param recipients  Array of recipient addresses.
     * @param hsTypes     Array of handshake types (must match recipients length).
     * @param notes       Array of notes (must match recipients length).
     *
     * @dev No ETH/token forwarding in batch mode. Pure social signals only.
     *      This keeps the gas accounting simple and prevents partial-failure complexity.
     */
    function sendBatch(
        address[] calldata recipients,
        HandshakeType[] calldata hsTypes,
        string[] calldata notes
    ) external whenNotPaused {
        uint256 len = recipients.length;
        require(len > 0 && len <= 10, "Handshake: batch 1-10");
        require(hsTypes.length == len, "Handshake: type length mismatch");
        require(notes.length == len, "Handshake: note length mismatch");

        // Reset daily window if needed (once for the batch)
        if (block.timestamp >= dailyWindowStart[msg.sender] + 1 days) {
            dailyWindowStart[msg.sender] = block.timestamp;
            dailyCount[msg.sender] = 0;
        }

        for (uint256 i = 0; i < len; i++) {
            address to = recipients[i];
            require(to != address(0), "Handshake: zero address");
            require(to != msg.sender, "Handshake: cannot self-handshake");
            require(bytes(notes[i]).length <= MAX_NOTE_LENGTH, "Handshake: note too long");
            require(dailyCount[msg.sender] < DAILY_CAP, "Handshake: daily cap reached");
            require(
                block.timestamp >= lastHandshakeAt[msg.sender][to] + PAIR_COOLDOWN,
                "Handshake: cooldown not met"
            );

            uint256 id = _recordHandshake(to);

            emit HandshakeSent(
                id,
                msg.sender,
                to,
                uint8(hsTypes[i]),
                ETH_SENTINEL, // no token in batch
                0,            // no value in batch
                notes[i],
                block.timestamp
            );
        }
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Check if sender has ever handshaked recipient.
    function hasConnection(address from, address to) external view returns (bool) {
        return hasHandshaked[from][to];
    }

    /// @notice Check if a mutual handshake exists (both directions).
    function isMutual(address a, address b) external view returns (bool) {
        return hasHandshaked[a][b] && hasHandshaked[b][a];
    }

    /// @notice Get the social stats for an agent.
    function getStats(address agent) external view returns (
        uint256 sent,
        uint256 received,
        uint256 uniqueInbound
    ) {
        return (sentCount[agent], receivedCount[agent], uniqueSenders[agent]);
    }
}

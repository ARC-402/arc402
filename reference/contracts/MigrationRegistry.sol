// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @dev Minimal interface for reading a wallet contract's owner.
 *      ARC402Wallet extends Ownable, so this applies to all wallet contracts.
 *      // Minimal interface — do not import AgentRegistry.sol to avoid circular deps
 */
interface IWalletOwnable {
    function owner() external view returns (address);
}

/**
 * @dev Minimal TrustRegistry interface required by MigrationRegistry.
 */
interface ITrustRegistryMin {
    function getScore(address wallet) external view returns (uint256);
}

/**
 * @dev Extended TrustRegistry interface for applying migration decay (Spec 29).
 */
interface ITrustRegistryForMigration {
    function applyMigrationDecay(address oldWallet, address newWallet, uint256 oldScore) external;
}

/**
 * @dev Minimal AgentRegistry interface required by MigrationRegistry.
 */
interface IAgentRegistryMin {
    function isRegistered(address wallet) external view returns (bool);
}

/**
 * @title MigrationRegistry
 * @notice Governance-controlled registry for ARC-402 wallet migrations.
 *
 * STATUS: Production-ready (Spec 29)
 *
 * Responsibilities:
 *   1. Record approved migrations from an old ARC402Wallet to a new one.
 *   2. Enforce same-owner constraint — migration cannot transfer identity.
 *   3. Apply 10% (1000 BPS) trust score decay on each migration.
 *   4. Enforce a 90-day cooldown to prevent rapid compounding abuse.
 *   5. Gate migration targets to protocol-approved implementations only.
 *   6. Provide lineage resolution so TrustRegistry can follow the chain.
 *
 * @dev Uses Ownable2Step (two-step ownership transfer) consistent with
 *      TrustRegistryV3 to prevent phishing-based ownership hijack.
 */
contract MigrationRegistry is Ownable2Step {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Decay applied to trust score on each migration (10% in BPS).
    uint256 public constant DECAY_BPS = 1000;

    /// @notice BPS denominator (100% = 10 000).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Minimum time between migrations for the same wallet lineage.
    uint256 public constant COOLDOWN = 90 days;

    /// @notice Maximum lineage depth to prevent infinite loops from circular migrations.
    uint256 public constant MAX_LINEAGE_DEPTH = 20;

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Migration {
        address oldWallet;
        address newWallet;
        address owner;           // Must be the same for both wallets
        uint256 migratedAt;
        uint256 scoreAtMigration;
        uint256 appliedDecay;    // 10% in BPS = 1000
    }

    // ─── Mappings ─────────────────────────────────────────────────────────────

    /// @notice Forward chain: old wallet → new wallet.
    mapping(address => address) public migratedTo;

    /// @notice Reverse chain: new wallet → old wallet.
    mapping(address => address) public migratedFrom;

    /// @notice Timestamp of the last migration involving a wallet (old or new).
    mapping(address => uint256) public lastMigratedAt;

    /// @notice Protocol-approved migration target addresses.
    mapping(address => bool) public approvedImplementations;

    /// @notice Full migration records, keyed by the old wallet address.
    mapping(address => Migration) private _migrations;

    // ─── Immutables ───────────────────────────────────────────────────────────

    /// @notice TrustRegistry — queried to read scores at migration time.
    ITrustRegistryMin public immutable trustRegistry;

    /// @notice AgentRegistry — used to verify both wallets are registered agents.
    IAgentRegistryMin public immutable agentRegistry;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a migration is recorded.
    event MigrationRegistered(
        address indexed oldWallet,
        address indexed newWallet,
        address indexed owner,
        uint256 scoreAtMigration,
        uint256 appliedDecay,
        uint256 migratedAt
    );

    /// @notice Emitted when a new implementation address is approved.
    event TargetApproved(address indexed implementation);
    event TargetRevoked(address indexed implementation);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _trustRegistry Address of the TrustRegistry (for score reads).
     * @param _agentRegistry Address of the AgentRegistry (for owner verification).
     */
    constructor(address _trustRegistry, address _agentRegistry) Ownable(msg.sender) {
        require(_trustRegistry != address(0), "MigrationRegistry: zero trust registry");
        require(_agentRegistry != address(0), "MigrationRegistry: zero agent registry");
        trustRegistry = ITrustRegistryMin(_trustRegistry);
        agentRegistry = IAgentRegistryMin(_agentRegistry);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Approve an address as a valid migration target.
     * @dev Protocol governance must approve each new ARC402Wallet implementation
     *      before it can be used as a migration destination. This prevents migration
     *      to malicious or downgraded contracts.
     * @param impl Address to approve.
     */
    function approveMigrationTarget(address impl) external onlyOwner {
        require(impl != address(0), "MigrationRegistry: zero address");
        approvedImplementations[impl] = true;
        emit TargetApproved(impl);
    }

    /// @notice Revoke a previously approved migration target.
    ///         Prevents new migrations to a known-compromised wallet implementation.
    function revokeMigrationTarget(address impl) external onlyOwner {
        require(impl != address(0), "MigrationRegistry: zero address");
        approvedImplementations[impl] = false;
        emit TargetRevoked(impl);
    }

    // ─── Migration ────────────────────────────────────────────────────────────

    /**
     * @notice Register a migration from oldWallet to newWallet.
     *
     * Requirements:
     *  - caller must be the Ownable owner of both wallet contracts
     *  - both wallets must be registered agents in AgentRegistry
     *  - newWallet must be an approved migration target
     *  - oldWallet must not already have a forward migration recorded
     *  - newWallet must not already have a reverse migration recorded
     *  - 90-day cooldown must have elapsed since oldWallet last participated in a migration
     *
     * Effects:
     *  - Records migratedTo / migratedFrom chain links
     *  - Sets lastMigratedAt for both wallets
     *  - Stores the Migration struct (including 10% decay applied to the old score)
     *  - Emits MigrationRegistered
     *
     * @param oldWallet The wallet being migrated from.
     * @param newWallet The wallet being migrated to.
     */
    function registerMigration(address oldWallet, address newWallet) external {
        require(oldWallet != address(0) && newWallet != address(0), "MigrationRegistry: zero address");
        require(oldWallet != newWallet, "MigrationRegistry: same wallet");

        // ── Owner verification ────────────────────────────────────────────────
        // Both wallet contracts must report the same owner, and the caller must be that owner.
        // This blocks migration-as-transfer: you cannot migrate to a wallet owned by another party.
        address oldOwner = IWalletOwnable(oldWallet).owner();
        address newOwner = IWalletOwnable(newWallet).owner();
        require(oldOwner == newOwner, "MigrationRegistry: owner mismatch");
        require(msg.sender == oldOwner, "MigrationRegistry: caller is not wallet owner");

        // ── Registry verification ─────────────────────────────────────────────
        // Both wallets must be registered ARC402 agents.
        require(agentRegistry.isRegistered(oldWallet), "MigrationRegistry: oldWallet not registered");
        require(agentRegistry.isRegistered(newWallet), "MigrationRegistry: newWallet not registered");

        // ── Approved target check ─────────────────────────────────────────────
        require(approvedImplementations[newWallet], "MigrationRegistry: target not approved");

        // ── No duplicate migration ────────────────────────────────────────────
        require(migratedTo[oldWallet] == address(0), "MigrationRegistry: oldWallet already migrated");
        require(migratedFrom[newWallet] == address(0), "MigrationRegistry: newWallet already has a source");

        // ── 90-day cooldown ───────────────────────────────────────────────────
        // lastMigratedAt is set on both wallets during a migration, so even if oldWallet
        // was previously a newWallet, the cooldown is enforced.
        require(
            block.timestamp >= lastMigratedAt[oldWallet] + COOLDOWN,
            "MigrationRegistry: cooldown active"
        );

        // ── Circular migration guard ──────────────────────────────────────────
        // Resolve the tip of the chain starting at newWallet. If the tip is
        // oldWallet, registering this migration would create a cycle.
        address tip = resolveActiveWallet(newWallet);
        require(tip != oldWallet, "MigrationRegistry: circular migration");

        // ── Trust score decay ─────────────────────────────────────────────────
        // Read the current score from TrustRegistry. Silently defaults to 0 on failure.
        // The decayed score is recorded for lineage-aware resolvers (e.g. TrustRegistry
        // can apply scoreAtMigration * 0.9 when initialising the new wallet's score).
        uint256 score = 0;
        try trustRegistry.getScore(oldWallet) returns (uint256 s) {
            score = s;
        } catch {} // solhint-disable-line no-empty-blocks

        // ── Write records ─────────────────────────────────────────────────────
        uint256 ts = block.timestamp;

        migratedTo[oldWallet]   = newWallet;
        migratedFrom[newWallet] = oldWallet;
        lastMigratedAt[oldWallet] = ts;
        lastMigratedAt[newWallet] = ts;

        _migrations[oldWallet] = Migration({
            oldWallet:        oldWallet,
            newWallet:        newWallet,
            owner:            oldOwner,
            migratedAt:       ts,
            scoreAtMigration: score,
            appliedDecay:     DECAY_BPS
        });

        // ── Apply trust score decay (Spec 29) ─────────────────────────────────
        // Notify TrustRegistry so it can set newWallet's score to oldScore × 0.9.
        // Wrapped in try/catch so a TrustRegistry failure cannot block migration.
        try ITrustRegistryForMigration(address(trustRegistry)).applyMigrationDecay(oldWallet, newWallet, score) {} catch {} // solhint-disable-line no-empty-blocks

        emit MigrationRegistered(oldWallet, newWallet, oldOwner, score, DECAY_BPS, ts);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Follow the migratedTo chain to find the current active wallet.
     * @dev The TrustRegistry calls this to route score queries to the live wallet.
     *      If wallet has never migrated, returns wallet itself.
     * @param wallet Any address in the lineage (starting point may be old or current).
     * @return The current active wallet (last address in the migratedTo chain).
     */
    function resolveActiveWallet(address wallet) public view returns (address) {
        address current = wallet;
        uint256 depth = 0;
        while (migratedTo[current] != address(0)) {
            current = migratedTo[current];
            depth++;
            if (depth > MAX_LINEAGE_DEPTH) revert("MigrationRegistry: lineage too deep");
        }
        return current;
    }

    /**
     * @notice Return the full migration lineage from the oldest ancestor to the current wallet.
     * @dev Walks migratedFrom back to the root, then walks migratedTo forward to build the array.
     *      Single-element array for a wallet that has never been part of any migration.
     * @param wallet Any wallet address in the lineage.
     * @return Array of wallet addresses ordered from oldest (index 0) to newest (last index).
     */
    function getLineage(address wallet) external view returns (address[] memory) {
        // Walk back to the root (original wallet with no predecessor)
        address root = wallet;
        uint256 depth = 0;
        while (migratedFrom[root] != address(0)) {
            root = migratedFrom[root];
            depth++;
            if (depth > MAX_LINEAGE_DEPTH) revert("MigrationRegistry: lineage too deep");
        }

        // Count total chain length root → ... → tip
        uint256 length = 0;
        address cur = root;
        while (cur != address(0)) {
            length++;
            if (length > MAX_LINEAGE_DEPTH + 1) revert("MigrationRegistry: lineage too deep");
            cur = migratedTo[cur];
        }

        // Build and return the ordered array
        address[] memory lineage = new address[](length);
        cur = root;
        for (uint256 i = 0; i < length; i++) {
            lineage[i] = cur;
            cur = migratedTo[cur];
        }

        return lineage;
    }

    /**
     * @notice Returns whether an address is an approved migration target.
     * @param impl Address to check.
     */
    function isMigrationTarget(address impl) external view returns (bool) {
        return approvedImplementations[impl];
    }

    /**
     * @notice Returns the full Migration record for a given old wallet.
     * @dev Returns a zero-value struct if oldWallet has never migrated.
     * @param oldWallet The source wallet of the migration.
     */
    function getMigration(address oldWallet) external view returns (Migration memory) {
        return _migrations[oldWallet];
    }

    /// @notice Protocol version tag (Spec 20).
    function protocolVersion() external pure returns (string memory) {
        return "1.0.0";
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAgentRegistry.sol";
import "./interfaces/IResearchSquad.sol";

/**
 * @title ResearchSquad
 * @notice Structured agent groups investigating a shared domain.
 *
 *         Any registered ARC-402 agent can create a squad. Squads have open or
 *         invite-only membership, role-based access (LEAD / CONTRIBUTOR), and an
 *         on-chain contribution log anchored by content hashes.
 *
 *         Security:
 *         - CEI pattern on every state-changing function
 *         - No reentrancy risk (no value transfer)
 *         - Custom errors only
 *
 * @dev    Solidity 0.8.24 · immutable · no via_ir · no upgradeable proxy
 */
contract ResearchSquad is IResearchSquad {

    // ─── Types ────────────────────────────────────────────────────────────────

    /// @dev `Archived` is reserved for future use; no current transition sets it.
    enum Status     { Active, Completed, Archived }

    struct Squad {
        string  name;
        string  domainTag;
        address creator;
        Status  status;
        bool    inviteOnly;
        uint256 memberCount;
    }

    struct Contribution {
        uint256 squadId;
        address contributor;
        bytes32 contributionHash;
        string  description;
        uint256 timestamp;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotRegistered();
    error SquadNotFound();
    error SquadNotActive();
    error AlreadyMember();
    error NotMember();
    error NotLead();
    error InviteOnly();
    error AlreadyInvited();
    error InvalidName();
    error InvalidDomainTag();
    error ZeroAddress();
    error HashAlreadyRecorded();
    error SquadFull();

    // ─── Events ───────────────────────────────────────────────────────────────

    event SquadCreated(
        uint256 indexed squadId,
        address indexed creator,
        string  name,
        string  domainTag,
        bool    inviteOnly,
        uint256 timestamp
    );

    event MemberJoined(
        uint256 indexed squadId,
        address indexed member,
        Role    role,
        uint256 timestamp
    );

    event ContributionRecorded(
        uint256 indexed squadId,
        address indexed contributor,
        bytes32 indexed contributionHash,
        string  description,
        uint256 timestamp
    );

    event AgentInvited(
        uint256 indexed squadId,
        address indexed agent,
        address indexed invitedBy,
        uint256 timestamp
    );

    event SquadConcluded(
        uint256 indexed squadId,
        address indexed concludedBy,
        uint256 timestamp
    );

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_SQUAD_MEMBERS = 500;

    // ─── State ────────────────────────────────────────────────────────────────

    IAgentRegistry public immutable agentRegistry;

    uint256 private _nextSquadId;

    /// squadId → Squad
    mapping(uint256 => Squad) private _squads;

    /// squadId → member address → Role
    mapping(uint256 => mapping(address => Role)) private _roles;

    /// squadId → member address → isMember
    mapping(uint256 => mapping(address => bool)) private _isMember;

    /// squadId → member address → isInvited
    mapping(uint256 => mapping(address => bool)) private _invited;

    /// squadId → ordered member list
    mapping(uint256 => address[]) private _members;

    /// Global contribution list
    Contribution[] private _contributions;

    /// contributionHash → already recorded (global dedup)
    mapping(bytes32 => bool) private _contributionRecorded;

    /// squadId → contribution indices in _contributions
    mapping(uint256 => uint256[]) private _squadContributions;

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _agentRegistry) {
        if (_agentRegistry == address(0)) revert ZeroAddress();
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    // ─── Writes ───────────────────────────────────────────────────────────────

    /**
     * @notice Create a new research squad. Caller becomes the first LEAD.
     */
    function createSquad(
        string calldata name,
        string calldata domainTag,
        bool    inviteOnly
    ) external returns (uint256 squadId) {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        if (bytes(name).length == 0)      revert InvalidName();
        if (bytes(domainTag).length == 0) revert InvalidDomainTag();

        // Effects
        squadId = _nextSquadId++;

        _squads[squadId] = Squad({
            name:        name,
            domainTag:   domainTag,
            creator:     msg.sender,
            status:      Status.Active,
            inviteOnly:  inviteOnly,
            memberCount: 1
        });

        _isMember[squadId][msg.sender] = true;
        _roles[squadId][msg.sender]    = Role.Lead;
        _members[squadId].push(msg.sender);

        emit SquadCreated(squadId, msg.sender, name, domainTag, inviteOnly, block.timestamp);
        emit MemberJoined(squadId, msg.sender, Role.Lead, block.timestamp);
    }

    /**
     * @notice Join a squad. Reverts if invite-only and caller was not invited.
     */
    function joinSquad(uint256 squadId) external {
        Squad storage squad = _squads[squadId];
        if (squad.creator == address(0))       revert SquadNotFound();
        if (squad.status != Status.Active)     revert SquadNotActive();
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        if (_isMember[squadId][msg.sender])    revert AlreadyMember();
        if (squad.inviteOnly && !_invited[squadId][msg.sender]) revert InviteOnly();

        if (squad.memberCount >= MAX_SQUAD_MEMBERS) revert SquadFull();

        // Effects
        _isMember[squadId][msg.sender] = true;
        _roles[squadId][msg.sender]    = Role.Contributor;
        _members[squadId].push(msg.sender);
        squad.memberCount += 1;

        emit MemberJoined(squadId, msg.sender, Role.Contributor, block.timestamp);
    }

    /**
     * @notice Invite an agent to an invite-only squad. Caller must be LEAD.
     */
    function inviteAgent(uint256 squadId, address agent) external {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        Squad storage squad = _squads[squadId];
        if (squad.creator == address(0))    revert SquadNotFound();
        if (squad.status != Status.Active)  revert SquadNotActive();
        if (!_isMember[squadId][msg.sender] || _roles[squadId][msg.sender] != Role.Lead)
            revert NotLead();
        if (agent == address(0))            revert ZeroAddress();
        if (!agentRegistry.isRegistered(agent)) revert NotRegistered();
        if (_isMember[squadId][agent])      revert AlreadyMember();
        if (_invited[squadId][agent])       revert AlreadyInvited();

        // Effects
        _invited[squadId][agent] = true;

        emit AgentInvited(squadId, agent, msg.sender, block.timestamp);
    }

    /**
     * @notice Record a contribution. Any squad member may call this.
     */
    function recordContribution(
        uint256        squadId,
        bytes32        contributionHash,
        string calldata description
    ) external {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        Squad storage squad = _squads[squadId];
        if (squad.creator == address(0))       revert SquadNotFound();
        if (squad.status != Status.Active)     revert SquadNotActive();
        if (!_isMember[squadId][msg.sender])   revert NotMember();
        if (_contributionRecorded[contributionHash]) revert HashAlreadyRecorded();

        // Effects — record before emitting
        uint256 idx = _contributions.length;
        _contributions.push(Contribution({
            squadId:          squadId,
            contributor:      msg.sender,
            contributionHash: contributionHash,
            description:      description,
            timestamp:        block.timestamp
        }));
        _contributionRecorded[contributionHash] = true;
        _squadContributions[squadId].push(idx);

        emit ContributionRecorded(squadId, msg.sender, contributionHash, description, block.timestamp);
    }

    /**
     * @notice Conclude (complete) a squad. Caller must be LEAD.
     */
    function concludeSquad(uint256 squadId) external {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        Squad storage squad = _squads[squadId];
        if (squad.creator == address(0))    revert SquadNotFound();
        if (squad.status != Status.Active)  revert SquadNotActive();
        if (!_isMember[squadId][msg.sender] || _roles[squadId][msg.sender] != Role.Lead)
            revert NotLead();

        // Effects
        squad.status = Status.Completed;

        emit SquadConcluded(squadId, msg.sender, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getSquad(uint256 squadId) external view returns (Squad memory) {
        if (_squads[squadId].creator == address(0)) revert SquadNotFound();
        return _squads[squadId];
    }

    function getMembers(uint256 squadId) external view returns (address[] memory) {
        if (_squads[squadId].creator == address(0)) revert SquadNotFound();
        return _members[squadId];
    }

    function getMemberRole(uint256 squadId, address member) external view returns (Role) {
        if (_squads[squadId].creator == address(0)) revert SquadNotFound();
        if (!_isMember[squadId][member])            revert NotMember();
        return _roles[squadId][member];
    }

    function isMember(uint256 squadId, address agent) external view returns (bool) {
        return _isMember[squadId][agent];
    }

    function isInvited(uint256 squadId, address agent) external view returns (bool) {
        return _invited[squadId][agent];
    }

    function getSquadContributions(uint256 squadId)
        external
        view
        returns (Contribution[] memory result)
    {
        uint256[] storage indices = _squadContributions[squadId];
        result = new Contribution[](indices.length);
        for (uint256 i = 0; i < indices.length; i++) {
            result[i] = _contributions[indices[i]];
        }
    }

    function totalSquads() external view returns (uint256) {
        return _nextSquadId;
    }
}

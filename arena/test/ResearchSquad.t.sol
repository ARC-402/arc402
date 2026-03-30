// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ResearchSquad.sol";

// ─── Mock AgentRegistry ───────────────────────────────────────────────────────

contract MockAgentRegistry {
    mapping(address => bool) private _registered;

    function setRegistered(address agent, bool val) external {
        _registered[agent] = val;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _registered[wallet];
    }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

contract ResearchSquadTest is Test {
    ResearchSquad     public squad;
    MockAgentRegistry public agentReg;

    address public agentA      = address(0xA1);
    address public agentB      = address(0xB2);
    address public agentC      = address(0xC3);
    address public unregistered = address(0xD4);

    string constant NAME       = "BTC Research Squad";
    string constant DOMAIN     = "market.crypto";
    string constant NAME2      = "DeFi Squad";
    string constant DOMAIN2    = "defi.lending";

    bytes32 constant HASH_1    = keccak256("contribution-1");
    bytes32 constant HASH_2    = keccak256("contribution-2");
    string  constant DESC_1    = "Analysed Q1 on-chain flows";
    string  constant DESC_2    = "Compiled MEV data for the quarter";

    function setUp() public {
        agentReg = new MockAgentRegistry();
        squad    = new ResearchSquad(address(agentReg));

        agentReg.setRegistered(agentA, true);
        agentReg.setRegistered(agentB, true);
        agentReg.setRegistered(agentC, true);
        // unregistered stays false
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    function _createSquad(address creator, bool inviteOnly) internal returns (uint256) {
        vm.prank(creator);
        return squad.createSquad(NAME, DOMAIN, inviteOnly);
    }

    // ─── 1. Create squad happy path ──────────────────────────────────────────

    function test_CreateSquad_HappyPath() public {
        vm.expectEmit(true, true, false, true);
        emit ResearchSquad.SquadCreated(0, agentA, NAME, DOMAIN, false, block.timestamp);

        uint256 id = _createSquad(agentA, false);
        assertEq(id, 0);

        ResearchSquad.Squad memory s = squad.getSquad(0);
        assertEq(s.name,        NAME);
        assertEq(s.domainTag,   DOMAIN);
        assertEq(s.creator,     agentA);
        assertEq(uint8(s.status), uint8(ResearchSquad.Status.Active));
        assertFalse(s.inviteOnly);
        assertEq(s.memberCount, 1);
    }

    // ─── 2. Creator is auto-assigned LEAD ────────────────────────────────────

    function test_CreateSquad_CreatorIsLead() public {
        _createSquad(agentA, false);
        assertTrue(squad.isMember(0, agentA));
        assertEq(uint8(squad.getMemberRole(0, agentA)), uint8(ResearchSquad.Role.Lead));
    }

    // ─── 3. Unregistered agent cannot create squad ───────────────────────────

    function test_CreateSquad_Unregistered_Reverts() public {
        vm.prank(unregistered);
        vm.expectRevert(ResearchSquad.NotRegistered.selector);
        squad.createSquad(NAME, DOMAIN, false);
    }

    // ─── 4. Empty name reverts ───────────────────────────────────────────────

    function test_CreateSquad_EmptyName_Reverts() public {
        vm.prank(agentA);
        vm.expectRevert(ResearchSquad.InvalidName.selector);
        squad.createSquad("", DOMAIN, false);
    }

    // ─── 5. Empty domainTag reverts ──────────────────────────────────────────

    function test_CreateSquad_EmptyDomainTag_Reverts() public {
        vm.prank(agentA);
        vm.expectRevert(ResearchSquad.InvalidDomainTag.selector);
        squad.createSquad(NAME, "", false);
    }

    // ─── 6. Join open squad ──────────────────────────────────────────────────

    function test_JoinSquad_Open_HappyPath() public {
        _createSquad(agentA, false);

        vm.expectEmit(true, true, false, true);
        emit ResearchSquad.MemberJoined(0, agentB, ResearchSquad.Role.Contributor, block.timestamp);

        vm.prank(agentB);
        squad.joinSquad(0);

        assertTrue(squad.isMember(0, agentB));
        assertEq(uint8(squad.getMemberRole(0, agentB)), uint8(ResearchSquad.Role.Contributor));
        assertEq(squad.getSquad(0).memberCount, 2);
    }

    // ─── 7. Join invite-only without invite reverts ──────────────────────────

    function test_JoinSquad_InviteOnly_NoInvite_Reverts() public {
        _createSquad(agentA, true);

        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.InviteOnly.selector);
        squad.joinSquad(0);
    }

    // ─── 8. Join invite-only with invite succeeds ────────────────────────────

    function test_JoinSquad_InviteOnly_WithInvite_Succeeds() public {
        _createSquad(agentA, true);

        vm.prank(agentA);
        squad.inviteAgent(0, agentB);

        vm.prank(agentB);
        squad.joinSquad(0);

        assertTrue(squad.isMember(0, agentB));
    }

    // ─── 9. Double-join reverts ───────────────────────────────────────────────

    function test_JoinSquad_AlreadyMember_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentB);
        squad.joinSquad(0);

        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.AlreadyMember.selector);
        squad.joinSquad(0);
    }

    // ─── 10. Non-lead (Contributor) cannot invite ────────────────────────────

    function test_InviteAgent_NonLead_Reverts() public {
        // Open squad so agentB can join as Contributor
        _createSquad(agentA, false);

        vm.prank(agentB);
        squad.joinSquad(0);

        // agentB is Contributor — cannot invite
        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.NotLead.selector);
        squad.inviteAgent(0, agentC);
    }

    // ─── 11. Record contribution happy path ──────────────────────────────────

    function test_RecordContribution_HappyPath() public {
        _createSquad(agentA, false);

        vm.expectEmit(true, true, true, true);
        emit ResearchSquad.ContributionRecorded(0, agentA, HASH_1, DESC_1, block.timestamp);

        vm.prank(agentA);
        squad.recordContribution(0, HASH_1, DESC_1);

        ResearchSquad.Contribution[] memory contribs = squad.getSquadContributions(0);
        assertEq(contribs.length, 1);
        assertEq(contribs[0].contributionHash, HASH_1);
        assertEq(contribs[0].contributor,      agentA);
        assertEq(contribs[0].description,      DESC_1);
    }

    // ─── 12. Non-member cannot record contribution ───────────────────────────

    function test_RecordContribution_NonMember_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.NotMember.selector);
        squad.recordContribution(0, HASH_1, DESC_1);
    }

    // ─── 13. Duplicate contribution hash reverts ─────────────────────────────

    function test_RecordContribution_DuplicateHash_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentA);
        squad.recordContribution(0, HASH_1, DESC_1);

        vm.prank(agentA);
        vm.expectRevert(ResearchSquad.HashAlreadyRecorded.selector);
        squad.recordContribution(0, HASH_1, DESC_2);
    }

    // ─── 14. Conclude squad ───────────────────────────────────────────────────

    function test_ConcludeSquad_HappyPath() public {
        _createSquad(agentA, false);

        vm.expectEmit(true, true, false, true);
        emit ResearchSquad.SquadConcluded(0, agentA, block.timestamp);

        vm.prank(agentA);
        squad.concludeSquad(0);

        assertEq(uint8(squad.getSquad(0).status), uint8(ResearchSquad.Status.Completed));
    }

    // ─── 15. Non-lead cannot conclude ────────────────────────────────────────

    function test_ConcludeSquad_NonLead_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentB);
        squad.joinSquad(0);

        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.NotLead.selector);
        squad.concludeSquad(0);
    }

    // ─── 16. Cannot join completed squad ─────────────────────────────────────

    function test_JoinSquad_Completed_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentA);
        squad.concludeSquad(0);

        vm.prank(agentB);
        vm.expectRevert(ResearchSquad.SquadNotActive.selector);
        squad.joinSquad(0);
    }

    // ─── 17. Cannot record contribution to completed squad ───────────────────

    function test_RecordContribution_CompletedSquad_Reverts() public {
        _createSquad(agentA, false);

        vm.prank(agentA);
        squad.concludeSquad(0);

        vm.prank(agentA);
        vm.expectRevert(ResearchSquad.SquadNotActive.selector);
        squad.recordContribution(0, HASH_1, DESC_1);
    }

    // ─── 18. Multiple squads increment IDs ───────────────────────────────────

    function test_MultipleSquads_IncrementIds() public {
        vm.prank(agentA);
        uint256 id0 = squad.createSquad(NAME,  DOMAIN,  false);
        vm.prank(agentB);
        uint256 id1 = squad.createSquad(NAME2, DOMAIN2, false);

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(squad.totalSquads(), 2);
    }

    // ─── 19. getMembers returns correct list ─────────────────────────────────

    function test_GetMembers_ReturnsCorrectList() public {
        _createSquad(agentA, false);

        vm.prank(agentB);
        squad.joinSquad(0);

        address[] memory members = squad.getMembers(0);
        assertEq(members.length, 2);
        assertEq(members[0], agentA);
        assertEq(members[1], agentB);
    }

    // ─── 20. Constructor rejects zero address ────────────────────────────────

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(ResearchSquad.ZeroAddress.selector);
        new ResearchSquad(address(0));
    }

    // ─── 21. getSquad on unknown ID reverts ──────────────────────────────────

    function test_GetSquad_UnknownId_Reverts() public {
        vm.expectRevert(ResearchSquad.SquadNotFound.selector);
        squad.getSquad(999);
    }

    // ─── 22. Duplicate invite reverts ────────────────────────────────────────

    function test_InviteAgent_Duplicate_Reverts() public {
        _createSquad(agentA, true);

        vm.prank(agentA);
        squad.inviteAgent(0, agentB);

        vm.prank(agentA);
        vm.expectRevert(ResearchSquad.AlreadyInvited.selector);
        squad.inviteAgent(0, agentB);
    }

    // ─── 23. Contributor in open squad can record contribution ───────────────

    function test_Contributor_CanRecordContribution() public {
        _createSquad(agentA, false);

        vm.prank(agentB);
        squad.joinSquad(0);

        vm.prank(agentB);
        squad.recordContribution(0, HASH_2, DESC_2);

        ResearchSquad.Contribution[] memory contribs = squad.getSquadContributions(0);
        assertEq(contribs.length, 1);
        assertEq(contribs[0].contributor, agentB);
    }
}

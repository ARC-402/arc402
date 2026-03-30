// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/AgentNewsletter.sol";

// ─── Mock AgentRegistry ───────────────────────────────────────────────────────

contract MockAgentRegistryAN {
    mapping(address => bool) private _registered;

    function setRegistered(address agent, bool val) external {
        _registered[agent] = val;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _registered[wallet];
    }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

contract AgentNewsletterTest is Test {
    AgentNewsletter       public newsletter;
    MockAgentRegistryAN   public agentReg;

    address public publisher   = address(0xA1);
    address public publisher2  = address(0xB2);
    address public outsider    = address(0xC3);

    string  constant NAME         = "GigaBrain Weekly";
    string  constant DESC         = "Weekly intelligence digest from the GigaBrain node";
    string  constant ENDPOINT     = "gigabrain.arc402.xyz";
    string  constant ENDPOINT_2   = "researchbot.arc402.xyz";

    bytes32 constant HASH_1       = keccak256("issue-content-1");
    bytes32 constant HASH_2       = keccak256("issue-content-2");
    bytes32 constant HASH_3       = keccak256("issue-content-3");
    string  constant PREVIEW_OK   = "This week: BTC holds 68k, DeFi TVL climbs, new arena rounds open.";

    function setUp() public {
        agentReg   = new MockAgentRegistryAN();
        newsletter = new AgentNewsletter(address(agentReg));

        agentReg.setRegistered(publisher,  true);
        agentReg.setRegistered(publisher2, true);
        // outsider stays unregistered
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _createNewsletter(address caller) internal returns (uint256) {
        vm.prank(caller);
        return newsletter.createNewsletter(NAME, DESC, ENDPOINT);
    }

    function _publishIssue(
        address  caller,
        uint256  nlId,
        bytes32  hash,
        string memory preview,
        string memory endpoint
    ) internal {
        vm.prank(caller);
        newsletter.publishIssue(nlId, hash, preview, endpoint);
    }

    // ─── 1. Create newsletter happy path ─────────────────────────────────────

    function test_CreateNewsletter_HappyPath() public {
        vm.expectEmit(true, true, false, true);
        emit AgentNewsletter.NewsletterCreated(0, publisher, NAME, ENDPOINT);

        uint256 id = _createNewsletter(publisher);
        assertEq(id, 0);

        AgentNewsletter.Newsletter memory nl = newsletter.getNewsletter(0);
        assertEq(nl.publisher,   publisher);
        assertEq(nl.name,        NAME);
        assertEq(nl.description, DESC);
        assertEq(nl.endpoint,    ENDPOINT);
        assertTrue(nl.active);
    }

    // ─── 2. Unregistered agent cannot create newsletter ──────────────────────

    function test_CreateNewsletter_Unregistered_Reverts() public {
        vm.prank(outsider);
        vm.expectRevert(AgentNewsletter.NotRegistered.selector);
        newsletter.createNewsletter(NAME, DESC, ENDPOINT);
    }

    // ─── 3. Empty name reverts ───────────────────────────────────────────────

    function test_CreateNewsletter_EmptyName_Reverts() public {
        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.InvalidName.selector);
        newsletter.createNewsletter("", DESC, ENDPOINT);
    }

    // ─── 4. Empty endpoint reverts ───────────────────────────────────────────

    function test_CreateNewsletter_EmptyEndpoint_Reverts() public {
        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.EmptyEndpoint.selector);
        newsletter.createNewsletter(NAME, DESC, "");
    }

    // ─── 5. Publish issue happy path ─────────────────────────────────────────

    function test_PublishIssue_HappyPath() public {
        uint256 id = _createNewsletter(publisher);

        vm.expectEmit(true, true, false, true);
        emit AgentNewsletter.IssuePublished(id, 1, HASH_1, PREVIEW_OK, ENDPOINT, block.timestamp);

        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);

        AgentNewsletter.Issue memory issue = newsletter.getIssue(id, 1);
        assertEq(issue.newsletterId, id);
        assertEq(issue.issueNumber,  1);
        assertEq(issue.contentHash,  HASH_1);
        assertEq(issue.preview,      PREVIEW_OK);
        assertEq(issue.endpoint,     ENDPOINT);
        assertEq(issue.timestamp,    block.timestamp);
    }

    // ─── 6. Issue numbers increment per newsletter ───────────────────────────

    function test_PublishIssue_IssueNumbersIncrement() public {
        uint256 id = _createNewsletter(publisher);

        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);
        _publishIssue(publisher, id, HASH_2, PREVIEW_OK, ENDPOINT);

        assertEq(newsletter.issueCount(id), 2);

        AgentNewsletter.Issue memory i2 = newsletter.getIssue(id, 2);
        assertEq(i2.issueNumber, 2);
        assertEq(i2.contentHash, HASH_2);
    }

    // ─── 7. Non-publisher cannot publish issue ───────────────────────────────

    function test_PublishIssue_NonPublisher_Reverts() public {
        uint256 id = _createNewsletter(publisher);

        vm.prank(publisher2);
        vm.expectRevert(AgentNewsletter.NotPublisher.selector);
        newsletter.publishIssue(id, HASH_1, PREVIEW_OK, ENDPOINT);
    }

    // ─── 8. Preview over 140 chars reverts ───────────────────────────────────

    function test_PublishIssue_PreviewTooLong_Reverts() public {
        uint256 id = _createNewsletter(publisher);

        bytes memory buf = new bytes(141);
        for (uint i = 0; i < 141; i++) buf[i] = 0x41;

        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.PreviewTooLong.selector);
        newsletter.publishIssue(id, HASH_1, string(buf), ENDPOINT);
    }

    // ─── 9. Preview exactly 140 chars accepted ───────────────────────────────

    function test_PublishIssue_Preview140Accepted() public {
        uint256 id = _createNewsletter(publisher);

        bytes memory buf = new bytes(140);
        for (uint i = 0; i < 140; i++) buf[i] = 0x41;

        _publishIssue(publisher, id, HASH_1, string(buf), ENDPOINT);
        assertEq(bytes(newsletter.getIssue(id, 1).preview).length, 140);
    }

    // ─── 10. Duplicate contentHash reverts ───────────────────────────────────

    function test_PublishIssue_DuplicateHash_Reverts() public {
        uint256 id = _createNewsletter(publisher);
        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);

        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.HashAlreadyPublished.selector);
        newsletter.publishIssue(id, HASH_1, PREVIEW_OK, ENDPOINT);
    }

    // ─── 11. Zero contentHash reverts ────────────────────────────────────────

    function test_PublishIssue_ZeroHash_Reverts() public {
        uint256 id = _createNewsletter(publisher);

        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.EmptyContentHash.selector);
        newsletter.publishIssue(id, bytes32(0), PREVIEW_OK, ENDPOINT);
    }

    // ─── 12. getIssues returns all issues ────────────────────────────────────

    function test_GetIssues_ReturnsAll() public {
        uint256 id = _createNewsletter(publisher);
        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);
        _publishIssue(publisher, id, HASH_2, PREVIEW_OK, ENDPOINT_2);

        AgentNewsletter.Issue[] memory issues = newsletter.getIssues(id);
        assertEq(issues.length, 2);
        assertEq(issues[0].contentHash, HASH_1);
        assertEq(issues[1].contentHash, HASH_2);
        assertEq(issues[1].endpoint,    ENDPOINT_2);
    }

    // ─── 13. Deactivate newsletter prevents new issues ───────────────────────

    function test_DeactivateNewsletter_BlocksPublish() public {
        uint256 id = _createNewsletter(publisher);

        vm.prank(publisher);
        newsletter.deactivateNewsletter(id);

        assertFalse(newsletter.getNewsletter(id).active);

        vm.prank(publisher);
        vm.expectRevert(AgentNewsletter.NewsletterNotActive.selector);
        newsletter.publishIssue(id, HASH_1, PREVIEW_OK, ENDPOINT);
    }

    // ─── 14. Non-publisher cannot deactivate ─────────────────────────────────

    function test_DeactivateNewsletter_NonPublisher_Reverts() public {
        uint256 id = _createNewsletter(publisher);

        vm.prank(publisher2);
        vm.expectRevert(AgentNewsletter.NotPublisher.selector);
        newsletter.deactivateNewsletter(id);
    }

    // ─── 15. Multiple newsletters have independent IDs and issue counts ───────

    function test_MultipleNewsletters_IndependentCounts() public {
        uint256 id0 = _createNewsletter(publisher);
        uint256 id1 = _createNewsletter(publisher2);

        _publishIssue(publisher,  id0, HASH_1, PREVIEW_OK, ENDPOINT);
        _publishIssue(publisher,  id0, HASH_2, PREVIEW_OK, ENDPOINT);
        _publishIssue(publisher2, id1, HASH_3, PREVIEW_OK, ENDPOINT_2);

        assertEq(newsletter.issueCount(id0), 2);
        assertEq(newsletter.issueCount(id1), 1);
        assertEq(newsletter.totalNewsletters(), 2);
    }

    // ─── 16. getNewsletter on unknown ID reverts ──────────────────────────────

    function test_GetNewsletter_UnknownId_Reverts() public {
        vm.expectRevert(AgentNewsletter.NewsletterNotFound.selector);
        newsletter.getNewsletter(999);
    }

    // ─── 17. getIssue on out-of-range issueNumber reverts ────────────────────

    function test_GetIssue_OutOfRange_Reverts() public {
        uint256 id = _createNewsletter(publisher);
        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);

        vm.expectRevert(AgentNewsletter.IssueNotFound.selector);
        newsletter.getIssue(id, 2);
    }

    // ─── 18. Constructor rejects zero address ────────────────────────────────

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(AgentNewsletter.ZeroAddress.selector);
        new AgentNewsletter(address(0));
    }

    // ─── 19. hashPublished tracks correctly ──────────────────────────────────

    function test_HashPublished_TracksCorrectly() public {
        uint256 id = _createNewsletter(publisher);
        assertFalse(newsletter.hashPublished(HASH_1));

        _publishIssue(publisher, id, HASH_1, PREVIEW_OK, ENDPOINT);
        assertTrue(newsletter.hashPublished(HASH_1));
    }

    // ─── 20. MAX_PREVIEW_LENGTH constant is 140 ──────────────────────────────

    function test_MaxPreviewLength_Is140() public view {
        assertEq(newsletter.MAX_PREVIEW_LENGTH(), 140);
    }
}

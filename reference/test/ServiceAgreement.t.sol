// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ServiceAgreement.sol";
import "../contracts/IServiceAgreement.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─── Mock ERC-20 ─────────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor() ERC20("MockToken", "MTK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

contract ServiceAgreementTest is Test {

    ServiceAgreement public sa;
    MockERC20 public token;

    address public owner   = address(this);
    address public client  = address(0xC1);
    address public provider = address(0xA1);
    address public stranger = address(0xBEEF);

    uint256 constant PRICE    = 1 ether;
    uint256 constant DEADLINE = 7 days; // added to block.timestamp in helpers
    bytes32 constant SPEC_HASH = keccak256("spec-v1");
    bytes32 constant DELIVERY_HASH = keccak256("delivery-v1");

    // ─── Setup ───────────────────────────────────────────────────────────────

    function setUp() public {
        sa    = new ServiceAgreement();
        token = new MockERC20();

        vm.deal(client, 100 ether);
        vm.deal(provider, 10 ether);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _propose() internal returns (uint256 id) {
        vm.prank(client);
        id = sa.propose{value: PRICE}(
            provider,
            "text-generation",
            "Generate a 1000-word article",
            PRICE,
            address(0),
            block.timestamp + DEADLINE,
            SPEC_HASH
        );
    }

    function _proposeERC20() internal returns (uint256 id) {
        token.mint(client, PRICE);
        vm.prank(client);
        token.approve(address(sa), PRICE);
        vm.prank(client);
        id = sa.propose(
            provider,
            "data-analysis",
            "Analyse on-chain data set",
            PRICE,
            address(token),
            block.timestamp + DEADLINE,
            SPEC_HASH
        );
    }

    // ─── Tests ───────────────────────────────────────────────────────────────

    function test_ProposeAndAccept() public {
        uint256 id = _propose();

        // Verify PROPOSED state
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(ag.id, 1);
        assertEq(ag.client, client);
        assertEq(ag.provider, provider);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.PROPOSED));
        assertEq(address(sa).balance, PRICE);

        // Provider accepts
        vm.prank(provider);
        sa.accept(id);

        ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.ACCEPTED));
    }

    function test_ProposeAndFulfill() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        uint256 providerBefore = provider.balance;

        vm.prank(provider);
        sa.fulfill(id, DELIVERY_HASH);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.FULFILLED));
        assertEq(ag.deliverablesHash, DELIVERY_HASH);
        assertGt(ag.resolvedAt, 0);

        // Provider received escrow
        assertEq(provider.balance, providerBefore + PRICE);
        assertEq(address(sa).balance, 0);
    }

    function test_Cancel() public {
        uint256 id = _propose();
        assertEq(address(sa).balance, PRICE);

        uint256 clientBefore = client.balance;

        vm.prank(client);
        sa.cancel(id);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.CANCELLED));

        // Client refunded
        assertEq(client.balance, clientBefore + PRICE);
        assertEq(address(sa).balance, 0);
    }

    function test_Dispute() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        vm.prank(client);
        sa.dispute(id, "Deliverables not as agreed");

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.DISPUTED));
        // Escrow still locked
        assertEq(address(sa).balance, PRICE);
    }

    function test_ResolveDisputeFavorProvider() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        vm.prank(provider);
        sa.dispute(id, "I delivered everything");

        uint256 providerBefore = provider.balance;

        // Owner resolves in provider's favour
        sa.resolveDispute(id, true);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.FULFILLED));
        assertEq(provider.balance, providerBefore + PRICE);
        assertEq(address(sa).balance, 0);
    }

    function test_ResolveDisputeFavorClient() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        vm.prank(client);
        sa.dispute(id, "Nothing was delivered");

        uint256 clientBefore = client.balance;

        // Owner resolves in client's favour
        sa.resolveDispute(id, false);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.CANCELLED));
        assertEq(client.balance, clientBefore + PRICE);
        assertEq(address(sa).balance, 0);
    }

    function test_ExpiredCancel() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        // Warp past deadline
        vm.warp(block.timestamp + DEADLINE + 1);

        uint256 clientBefore = client.balance;

        vm.prank(client);
        sa.expiredCancel(id);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.CANCELLED));
        assertEq(client.balance, clientBefore + PRICE);
        assertEq(address(sa).balance, 0);
    }

    function test_ERC20Agreement() public {
        uint256 id = _proposeERC20();

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(ag.token, address(token));
        assertEq(ag.price, PRICE);
        assertEq(token.balanceOf(address(sa)), PRICE);

        vm.prank(provider);
        sa.accept(id);

        uint256 providerBefore = token.balanceOf(provider);

        vm.prank(provider);
        sa.fulfill(id, DELIVERY_HASH);

        assertEq(token.balanceOf(provider), providerBefore + PRICE);
        assertEq(token.balanceOf(address(sa)), 0);

        ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.FULFILLED));
    }

    function test_RevertAccept_NotProvider() public {
        uint256 id = _propose();

        vm.prank(stranger);
        vm.expectRevert("ServiceAgreement: not provider");
        sa.accept(id);
    }

    function test_RevertFulfill_PastDeadline() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        // Warp past deadline
        vm.warp(block.timestamp + DEADLINE + 1);

        vm.prank(provider);
        vm.expectRevert("ServiceAgreement: past deadline");
        sa.fulfill(id, DELIVERY_HASH);
    }

    function test_RevertCancel_AlreadyAccepted() public {
        uint256 id = _propose();

        vm.prank(provider);
        sa.accept(id);

        vm.prank(client);
        vm.expectRevert("ServiceAgreement: not PROPOSED");
        sa.cancel(id);
    }

    function test_GetAgreementsByClient() public {
        uint256 id1 = _propose();
        uint256 id2 = _propose();

        uint256[] memory ids = sa.getAgreementsByClient(client);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }

    function test_GetAgreementsByProvider() public {
        uint256 id1 = _propose();
        uint256 id2 = _propose();

        uint256[] memory ids = sa.getAgreementsByProvider(provider);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }

    function test_AgreementCount() public {
        assertEq(sa.agreementCount(), 0);
        _propose();
        assertEq(sa.agreementCount(), 1);
        _propose();
        assertEq(sa.agreementCount(), 2);
    }

    function test_RevertGetAgreement_NotFound() public {
        vm.expectRevert("ServiceAgreement: not found");
        sa.getAgreement(999);
    }
}

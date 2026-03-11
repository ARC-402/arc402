// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ServiceAgreement Adversarial Attack Tests
 * @notice Simulates what a professional audit firm would attempt.
 *         Each test passes when the attack is BLOCKED correctly.
 *         Tests that expose real vulnerabilities are documented inline.
 * @dev Run with: forge test --match-path "test/ServiceAgreement.attack.t.sol" -vv
 */

import "forge-std/Test.sol";
import "../contracts/ServiceAgreement.sol";
import "../contracts/IServiceAgreement.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ═══════════════════════════════════════════════════════════════════════════════
// MALICIOUS CONTRACT SUITE
// ═══════════════════════════════════════════════════════════════════════════════

/// @dev Attacker posing as a provider — tries to re-enter fulfill() from receive().
///      Does NOT use try/catch so that the inner revert propagates through the
///      ETH call{value}("") back to the outer call, causing the whole tx to revert.
///      This is the realistic attack pattern for a reentrancy exploit.
contract MaliciousReentrantProvider {
    ServiceAgreement public sa;
    uint256 public agreementId;
    bool public attacking;
    bool public secondAgreementId_active;
    uint256 public secondAgreementId;
    string public attackTarget; // "fulfill", "resolve"

    constructor(ServiceAgreement _sa) {
        sa = _sa;
    }

    function setAgreementId(uint256 _id) external { agreementId = _id; }
    function setAttacking(bool _v) external { attacking = _v; }
    function setAttackTarget(string calldata _t) external { attackTarget = _t; }
    function setSecondAgreementId(uint256 _id) external {
        secondAgreementId = _id;
        secondAgreementId_active = true;
    }

    function doAccept(uint256 _id) external { sa.accept(_id); }
    function doFulfill(uint256 _id) external { sa.fulfill(_id, bytes32(0)); }
    function doDispute(uint256 _id) external { sa.dispute(_id, "attack"); }

    receive() external payable {
        if (!attacking) return;

        bytes32 target = keccak256(bytes(attackTarget));

        if (target == keccak256("fulfill")) {
            // Re-enter fulfill on same agreement — NO try/catch so revert propagates
            // ReentrancyGuard reverts inner call → revert bubbles through ETH transfer
            // → outer fulfill() fails at require(ok, "ETH transfer failed")
            sa.fulfill(agreementId, bytes32(0));
        } else if (target == keccak256("resolve") && secondAgreementId_active) {
            // Re-enter fulfill on a second ACCEPTED agreement during resolveDispute
            // Same mutex → inner revert propagates → entire resolveDispute reverts
            sa.fulfill(secondAgreementId, bytes32(0));
        }
    }
}

/// @dev Attacker posing as a client — tries to re-enter cancel() from receive().
///      Does NOT use try/catch so the inner revert propagates through the ETH
///      transfer call, causing the entire outer cancel() to revert.
contract MaliciousReentrantClient {
    ServiceAgreement public sa;
    uint256 public agreementId;
    bool public attacking;
    uint8 public reentryCount;

    constructor(ServiceAgreement _sa) {
        sa = _sa;
    }

    function setAgreementId(uint256 _id) external { agreementId = _id; }
    function setAttacking(bool _v) external { attacking = _v; }

    function doPropose(address provider, uint256 price, uint256 deadline) external payable returns (uint256) {
        return sa.propose{value: msg.value}(
            provider, "compute", "test", price, address(0), deadline, bytes32(0)
        );
    }

    function doCancel(uint256 _id) external { sa.cancel(_id); }
    function doExpiredCancel(uint256 _id) external { sa.expiredCancel(_id); }

    receive() external payable {
        if (!attacking) return;
        reentryCount++;
        if (reentryCount == 1) {
            // Re-enter cancel — NO try/catch so revert propagates up
            // ReentrancyGuard fires on inner call → revert through ETH transfer
            // → outer cancel() fails at require(ok, "ETH transfer failed")
            sa.cancel(agreementId);
        }
    }
}

/// @dev Fee-on-transfer token: burns 10% on every transfer
contract MockFeeToken is ERC20 {
    uint256 public constant FEE_BPS = 1000; // 10%

    constructor() ERC20("FeeToken", "FTK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0)) {
            // mint or burn — no fee
            super._update(from, to, amount);
            return;
        }
        uint256 fee = (amount * FEE_BPS) / 10000;
        uint256 received = amount - fee;
        // Burn fee from sender, transfer reduced amount
        super._update(from, address(0), fee); // burn fee
        super._update(from, to, received);    // transfer remainder
    }
}

/// @dev Standard mock ERC20 (no fee) for general use
contract MockERC20 is ERC20 {
    constructor() ERC20("MockToken", "MTK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACK TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

contract ServiceAgreementAttackTest is Test {

    ServiceAgreement public sa;
    MockERC20 public token;

    address public owner;
    address public client  = address(0xC1);
    address public provider = address(0xA1);

    uint256 constant PRICE    = 1 ether;
    uint256 constant DEADLINE = 7 days;

    function setUp() public {
        owner = address(this); // test contract is owner (deployed sa)
        sa    = new ServiceAgreement();
        token = new MockERC20();

        vm.deal(client, 100 ether);
        vm.deal(provider, 10 ether);
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    function _proposeETH(address _client, address _provider, uint256 _price, uint256 _deadlineOffset)
        internal returns (uint256 id)
    {
        vm.prank(_client);
        id = sa.propose{value: _price}(
            _provider, "compute", "test task", _price, address(0),
            block.timestamp + _deadlineOffset, bytes32(0)
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 1: Reentrancy on fulfill()
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Malicious provider re-enters fulfill() from receive().
     * @dev Expected: entire transaction reverts. Agreement stays ACCEPTED.
     *      The nonReentrant guard fires on the inner call, propagating revert
     *      up through the ETH transfer, causing the outer fulfill() to also revert.
     */
    function test_Attack_ReentrancyOnFulfill() public {
        // Deploy malicious provider
        MaliciousReentrantProvider attacker = new MaliciousReentrantProvider(sa);
        vm.deal(address(attacker), 1 ether);

        // Client proposes with malicious provider
        uint256 id = _proposeETH(client, address(attacker), PRICE, DEADLINE);
        attacker.setAgreementId(id);

        // Malicious provider accepts
        attacker.doAccept(id);

        // Arm the attack
        attacker.setAttacking(true);
        attacker.setAttackTarget("fulfill");

        // Attack: fulfill() should revert because reentrancy propagates
        vm.expectRevert();
        attacker.doFulfill(id);

        // Agreement must NOT be fulfilled — escrow intact
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.ACCEPTED),
            "Attack blocked: agreement remains ACCEPTED");
        assertEq(address(sa).balance, PRICE, "Attack blocked: escrow intact");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 2: Reentrancy on cancel()
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Malicious client re-enters cancel() from receive().
     * @dev Expected: entire transaction reverts due to ReentrancyGuard.
     *      Even without the guard, the state machine blocks double-cancel
     *      (second call fails "not PROPOSED"). Guard catches it first.
     */
    function test_Attack_ReentrancyOnCancel() public {
        MaliciousReentrantClient attacker = new MaliciousReentrantClient(sa);
        vm.deal(address(attacker), PRICE + 1 ether);

        // Attacker proposes as client
        vm.prank(address(attacker));
        uint256 id = attacker.doPropose{value: PRICE}(provider, PRICE, block.timestamp + DEADLINE);
        attacker.setAgreementId(id);

        // Arm the attack
        attacker.setAttacking(true);

        // Cancel should revert because nested cancel() fails and propagates up
        vm.expectRevert();
        attacker.doCancel(id);

        // Agreement must NOT be cancelled — escrow still in contract
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.PROPOSED),
            "Attack blocked: agreement remains PROPOSED");
        assertEq(address(sa).balance, PRICE, "Attack blocked: escrow intact");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 3: Reentrancy on resolveDispute()
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Malicious provider re-enters another nonReentrant function
     *         during resolveDispute()'s ETH release.
     * @dev resolveDispute favors provider → sends ETH → provider receive()
     *      tries to fulfill() a second ACCEPTED agreement.
     *      The shared ReentrancyGuard mutex blocks this and reverts the whole tx.
     */
    function test_Attack_ReentrancyOnResolveDispute() public {
        MaliciousReentrantProvider attacker = new MaliciousReentrantProvider(sa);
        vm.deal(client, 10 ether);

        // Agreement 1: will be disputed → resolved in attacker's favor
        uint256 id1 = _proposeETH(client, address(attacker), PRICE, DEADLINE);
        attacker.setAgreementId(id1);
        attacker.doAccept(id1);

        // Agreement 2: attacker will try to fulfill during resolveDispute
        uint256 id2 = _proposeETH(client, address(attacker), PRICE, DEADLINE);
        attacker.setSecondAgreementId(id2);
        attacker.doAccept(id2);

        // Dispute agreement 1
        vm.prank(client);
        sa.dispute(id1, "dispute");

        // Arm the reentrancy attack on resolve
        attacker.setAttacking(true);
        attacker.setAttackTarget("resolve");

        // Owner resolves in attacker's favour — ETH transfer triggers attack
        // The reentrancy guard must block the nested fulfill() call,
        // causing the ETH transfer to fail, reverting resolveDispute entirely
        vm.expectRevert();
        sa.resolveDispute(id1, true);

        // Verify state: dispute still active, no ETH moved
        IServiceAgreement.Agreement memory ag1 = sa.getAgreement(id1);
        assertEq(uint256(ag1.status), uint256(IServiceAgreement.Status.DISPUTED),
            "Attack blocked: agreement remains DISPUTED");
        assertEq(address(sa).balance, 2 * PRICE, "Attack blocked: both escrows intact");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 4: Self-Dealing Agreement (client == provider)
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Same address tries to be both client and provider.
     * @dev DESIGN FINDING: The contract has `require(provider != msg.sender)`
     *      which explicitly blocks this. Self-dealing is prevented at the
     *      protocol level. This test verifies the guard is active.
     */
    function test_Attack_SelfDealingAgreement() public {
        address selfDealer = address(0xDEAD);
        vm.deal(selfDealer, 10 ether);

        vm.prank(selfDealer);
        vm.expectRevert("ServiceAgreement: client == provider");
        sa.propose{value: PRICE}(
            selfDealer,   // provider == msg.sender (selfDealer)
            "compute", "self deal", PRICE, address(0),
            block.timestamp + DEADLINE, bytes32(0)
        );
        // Attack correctly blocked — no funds deposited
        assertEq(address(sa).balance, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 5: Zero-Price Griefing
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Attacker proposes agreement with price=0, hoping to spam or
     *         create unbounded state growth for free.
     * @dev DESIGN FINDING: The contract has `require(price > 0)` which blocks
     *      zero-price proposals. Free agreements are not supported by design.
     *      This prevents griefing via spam of no-cost agreements.
     */
    function test_Attack_ZeroPriceGriefing() public {
        vm.prank(client);
        vm.expectRevert("ServiceAgreement: zero price");
        sa.propose{value: 0}(
            provider, "compute", "free task", 0, address(0),
            block.timestamp + DEADLINE, bytes32(0)
        );
        // No agreement created, no state pollution
        assertEq(sa.agreementCount(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 6: Immediate Deadline Grief
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Client proposes with deadline = now + 1 second. Time passes.
     *         Provider accepts after deadline — accept should work (no deadline
     *         check on accept). Provider cannot fulfill (past deadline).
     *         Client can recover via expiredCancel. No funds trapped.
     * @dev This tests that no ETH gets permanently locked due to timing grief.
     */
    function test_Attack_ImmediateDeadlineGrief() public {
        // Propose with 1-second deadline
        uint256 shortDeadline = block.timestamp + 1;
        vm.prank(client);
        uint256 id = sa.propose{value: PRICE}(
            provider, "compute", "urgent", PRICE, address(0),
            shortDeadline, bytes32(0)
        );

        // Warp past deadline
        vm.warp(block.timestamp + 2);
        assertGt(block.timestamp, shortDeadline, "Sanity: past deadline");

        // Provider can still accept (no deadline gate on accept)
        vm.prank(provider);
        sa.accept(id);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.ACCEPTED));

        // Provider CANNOT fulfill — past deadline
        vm.prank(provider);
        vm.expectRevert("ServiceAgreement: past deadline");
        sa.fulfill(id, bytes32(0));

        // Client CAN recover via expiredCancel — no funds trapped
        uint256 clientBefore = client.balance;
        vm.prank(client);
        sa.expiredCancel(id);

        ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.CANCELLED),
            "Expired agreement cancelled successfully");
        assertEq(client.balance, clientBefore + PRICE, "Client fully refunded");
        assertEq(address(sa).balance, 0, "No ETH trapped in contract");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 7: Front-Run Dispute on Delivery (Race Condition)
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Simulates mempool race: provider calls fulfill(), client calls
     *         dispute() simultaneously. Tests both orderings.
     *
     *         Ordering A (fulfill first): fulfill() succeeds → dispute() reverts
     *         Ordering B (dispute first): dispute() succeeds → fulfill() reverts
     *
     * @dev The state machine is single-winner: first state transition wins.
     *      No dual-state corruption is possible.
     */
    function test_Attack_FrontRunDisputeOnDeliver() public {
        // ── Ordering A: fulfill wins the race ──────────────────────────────
        uint256 idA = _proposeETH(client, provider, PRICE, DEADLINE);
        vm.prank(provider); sa.accept(idA);

        // Provider fulfills first
        vm.prank(provider);
        sa.fulfill(idA, bytes32(0));

        // Client tries to dispute — must revert (agreement already FULFILLED)
        vm.prank(client);
        vm.expectRevert("ServiceAgreement: not ACCEPTED");
        sa.dispute(idA, "I disagree");

        IServiceAgreement.Agreement memory agA = sa.getAgreement(idA);
        assertEq(uint256(agA.status), uint256(IServiceAgreement.Status.FULFILLED),
            "Ordering A: FULFILLED state wins");

        // ── Ordering B: dispute wins the race ──────────────────────────────
        uint256 idB = _proposeETH(client, provider, PRICE, DEADLINE);
        vm.prank(provider); sa.accept(idB);

        // Client disputes first
        vm.prank(client);
        sa.dispute(idB, "Preemptive dispute");

        // Provider tries to fulfill — must revert (agreement now DISPUTED)
        vm.prank(provider);
        vm.expectRevert("ServiceAgreement: not ACCEPTED");
        sa.fulfill(idB, bytes32(0));

        IServiceAgreement.Agreement memory agB = sa.getAgreement(idB);
        assertEq(uint256(agB.status), uint256(IServiceAgreement.Status.DISPUTED),
            "Ordering B: DISPUTED state wins, escrow locked for arbitration");

        // Escrow for agreement B still in contract (dispute pending)
        assertGt(address(sa).balance, 0, "Agreement B escrow still locked");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 8: Fee-on-Transfer Token
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Client uses a fee-on-transfer token (10% fee per transfer).
     *         When proposing 100 tokens, contract only receives 90.
     *         The contract stores price=100 but holds 90.
     *
     * @dev ⚠️  REAL VULNERABILITY FOUND:
     *         The contract stores `ag.price` as the REQUESTED amount (100), not
     *         the RECEIVED amount (90). When attempting to release escrow, it
     *         tries to transfer 100 tokens but only holds 90 → REVERT.
     *
     *         Attack vector: A fee-on-transfer token permanently locks escrow:
     *         - fulfill() reverts (cannot send 100, only has 90)
     *         - cancel() reverts if in PROPOSED state (same issue)
     *         - expiredCancel() reverts (same issue)
     *         - resolveDispute() reverts (same issue)
     *
     *         Mitigation: Record actual received amount, not requested price.
     *         Use: uint256 before = token.balanceOf(address(this));
     *              IERC20(token).safeTransferFrom(..., price);
     *              uint256 actual = token.balanceOf(address(this)) - before;
     *              ag.price = actual;
     *
     *         This test PASSES by asserting that cancel() correctly reverts
     *         (confirming the vulnerability exists and is deterministic).
     */
    function test_Attack_FeeOnTransferToken() public {
        MockFeeToken feeToken = new MockFeeToken();
        uint256 requested = 100e18;

        // Mint 100 tokens to client
        feeToken.mint(client, requested);

        vm.startPrank(client);
        feeToken.approve(address(sa), requested);

        // Propose: client sends 100 tokens, contract receives 90
        uint256 id = sa.propose(
            provider, "compute", "fee-token task", requested,
            address(feeToken), block.timestamp + DEADLINE, bytes32(0)
        );
        vm.stopPrank();

        // Verify: contract holds 90 tokens but ag.price = 100
        uint256 contractBalance = feeToken.balanceOf(address(sa));
        assertEq(contractBalance, 90e18, "Contract received only 90 (10% fee taken)");

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(ag.price, requested, "ag.price stored as 100 (not actual 90)");

        // Now client tries to cancel — contract attempts to send 100 tokens but has 90
        // This REVERTS → escrow is permanently locked (vulnerability confirmed)
        vm.prank(client);
        vm.expectRevert(); // ERC20: transfer amount exceeds balance
        sa.cancel(id);

        // ⚠️  VULNERABILITY: Funds are now locked in the contract.
        //     The agreement is still PROPOSED, cancel failed.
        //     No path exists to recover the 90 tokens without contract upgrade.
        ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.PROPOSED),
            "VULNERABILITY: agreement stuck, escrow trapped");

        emit log_string("VULNERABILITY: Fee-on-transfer tokens lock escrow permanently.");
        emit log_string("Mitigation: track actual received amount, not requested price.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 9: Repeated expiredCancel
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Client calls expiredCancel twice on the same agreement.
     *         Second call must revert (agreement already CANCELLED).
     */
    function test_Attack_RepeatedExpiredCancel() public {
        uint256 id = _proposeETH(client, provider, PRICE, 1);
        vm.prank(provider); sa.accept(id);

        // Warp past deadline
        vm.warp(block.timestamp + 2);

        // First expiredCancel — should succeed
        vm.prank(client);
        sa.expiredCancel(id);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.CANCELLED));
        assertEq(address(sa).balance, 0);

        // Second expiredCancel — must revert (not ACCEPTED)
        vm.prank(client);
        vm.expectRevert("ServiceAgreement: not ACCEPTED");
        sa.expiredCancel(id);

        // Balance unchanged (no double-refund)
        assertEq(address(sa).balance, 0, "No double-refund via repeated expiredCancel");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 10: Owner Resolves Non-Disputed Agreement
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Owner tries to resolveDispute on a PROPOSED agreement.
     *         Must revert — owner cannot hijack escrow on non-disputed agreements.
     */
    function test_Attack_OwnerResolveNonDisputed() public {
        uint256 id = _proposeETH(client, provider, PRICE, DEADLINE);

        // Status is PROPOSED, not DISPUTED
        vm.expectRevert("ServiceAgreement: not DISPUTED");
        sa.resolveDispute(id, true); // owner calls this (test contract is owner)

        // Also test on ACCEPTED state
        vm.prank(provider);
        sa.accept(id);

        vm.expectRevert("ServiceAgreement: not DISPUTED");
        sa.resolveDispute(id, true);

        // Escrow intact
        assertEq(address(sa).balance, PRICE, "Owner cannot drain non-disputed escrow");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 11: Provider Fulfills After Dispute
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Provider tries to bypass dispute by calling fulfill() on a
     *         DISPUTED agreement. Must revert — escrow stays locked.
     */
    function test_Attack_ProviderFulfillAfterDispute() public {
        uint256 id = _proposeETH(client, provider, PRICE, DEADLINE);
        vm.prank(provider); sa.accept(id);

        // Client raises dispute
        vm.prank(client);
        sa.dispute(id, "I'm not satisfied");

        // Provider attempts to fulfill — must revert
        vm.prank(provider);
        vm.expectRevert("ServiceAgreement: not ACCEPTED");
        sa.fulfill(id, bytes32(0));

        // Escrow still locked in disputed state
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assertEq(uint256(ag.status), uint256(IServiceAgreement.Status.DISPUTED));
        assertEq(address(sa).balance, PRICE, "Provider cannot steal disputed escrow");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTACK 12: Multiple Agreements Drain Escrow
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Creates 3 concurrent agreements, cancels all 3.
     *         Verifies contract balance returns to exactly 0 — no double-counting
     *         or accounting bugs across multiple concurrent escrows.
     */
    function test_Attack_MultipleAgreementsDrainEscrow() public {
        uint256 price1 = 1 ether;
        uint256 price2 = 2 ether;
        uint256 price3 = 0.5 ether;
        uint256 total  = price1 + price2 + price3;

        vm.deal(client, total + 1 ether);

        // Create 3 concurrent agreements
        uint256 id1 = _proposeETH(client, provider, price1, DEADLINE);
        uint256 id2 = _proposeETH(client, provider, price2, DEADLINE);
        uint256 id3 = _proposeETH(client, provider, price3, DEADLINE);

        assertEq(address(sa).balance, total, "All 3 escrows held");

        uint256 clientBefore = client.balance;

        // Cancel all 3
        vm.prank(client); sa.cancel(id1);
        vm.prank(client); sa.cancel(id2);
        vm.prank(client); sa.cancel(id3);

        // Contract balance must be exactly 0
        assertEq(address(sa).balance, 0, "All escrows drained correctly - no funds trapped");
        assertEq(client.balance, clientBefore + total, "Client fully refunded across all 3");

        // All agreements in CANCELLED state
        assertEq(uint256(sa.getAgreement(id1).status), uint256(IServiceAgreement.Status.CANCELLED));
        assertEq(uint256(sa.getAgreement(id2).status), uint256(IServiceAgreement.Status.CANCELLED));
        assertEq(uint256(sa.getAgreement(id3).status), uint256(IServiceAgreement.Status.CANCELLED));
    }
}

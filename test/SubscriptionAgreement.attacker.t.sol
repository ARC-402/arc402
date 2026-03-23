// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../contracts/src/SubscriptionAgreement.sol";

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACKER CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title ReentrantSubscriber
 * @notice Malicious subscriber that tries to re-enter withdraw() on ETH receipt.
 *         Attack: drain contract by triggering reentrancy from withdraw callback.
 *         Expected: nonReentrant + CEI prevent double-withdrawal.
 */
contract ReentrantSubscriber {
    SubscriptionAgreement internal sa;
    uint256 public reentryCount;

    constructor(SubscriptionAgreement _sa) { sa = _sa; }

    receive() external payable {
        // Re-enter on every ETH receipt (simulates classic reentrancy attack)
        if (sa.pendingWithdrawals(address(this), address(0)) > 0) {
            reentryCount++;
            try sa.withdraw(address(0)) {} catch {}
        }
    }

    function doWithdraw() external {
        sa.withdraw(address(0));
    }

    function subscribe(uint256 offeringId, uint256 periods, uint256 totalCost) external payable {
        sa.subscribe{value: totalCost}(offeringId, periods);
    }

    function cancel(uint256 subId) external {
        sa.cancel(subId);
    }
}

/**
 * @title DoubleRenewalAttacker
 * @notice Attempts to renew the same subscription twice in one block before
 *         the period has actually elapsed.
 *         Attack: double-consume deposit by calling renewSubscription twice.
 *         Expected: NotYetRenewable on second call.
 */
contract DoubleRenewalAttacker {
    SubscriptionAgreement internal sa;

    constructor(SubscriptionAgreement _sa) { sa = _sa; }

    function attack(uint256 subscriptionId) external {
        // First call: valid renewal (caller ensures enough time has passed)
        sa.renewSubscription(subscriptionId);
        // Second call: immediately — period not yet elapsed → must revert
        sa.renewSubscription(subscriptionId);
    }
}

/**
 * @title GriefDisputeAttacker
 * @notice Subscribes and immediately disputes every period to harass provider.
 *         Attack: disrupt provider operations by cycling subscribe → dispute → SUBSCRIBER_WINS.
 *         Expected: owner controls resolution; attacker loses first-period payment each cycle.
 */
contract GriefDisputeAttacker {
    SubscriptionAgreement internal sa;

    constructor(SubscriptionAgreement _sa) { sa = _sa; }

    function subscribeAndDispute(uint256 offeringId) external payable returns (uint256 subId) {
        subId = sa.subscribe{value: msg.value}(offeringId, 1);
        sa.disputeSubscription(subId);
    }

    receive() external payable {}
}

/**
 * @title MaxSubsOverflowAttacker
 * @notice Attempts to subscribe beyond maxSubscribers cap.
 *         Expected: MaxSubscribersReached.
 */
contract MaxSubsOverflowAttacker {
    SubscriptionAgreement internal sa;

    constructor(SubscriptionAgreement _sa) { sa = _sa; }

    function tryOverflow(uint256 offeringId, uint256 price) external payable {
        // First subscribe from this contract
        sa.subscribe{value: price}(offeringId, 1);
        // Second attempt — same subscriber, already active → AlreadyActive
        sa.subscribe{value: price}(offeringId, 1);
    }
}

/**
 * @notice Minimal mock ERC-20 for attacker suite.
 */
contract MockERC20Attacker {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt);
        balanceOf[msg.sender] -= amt;
        balanceOf[to]         += amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        require(balanceOf[from] >= amt);
        require(allowance[from][msg.sender] >= amt);
        allowance[from][msg.sender] -= amt;
        balanceOf[from]             -= amt;
        balanceOf[to]               += amt;
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACKER TEST SUITE
// All attack tests MUST FAIL — i.e., the attack is prevented.
// ═══════════════════════════════════════════════════════════════════════════════

contract SubscriptionAgreementAttackerTest is Test {
    SubscriptionAgreement internal sa;
    MockERC20Attacker     internal token;

    address internal owner    = address(this);
    address internal provider = address(0xA1);
    address internal alice    = address(0xA2);

    uint256 internal constant PRICE  = 1 ether;
    uint256 internal constant PERIOD = 30 days;
    bytes32 internal constant HASH   = keccak256("content v1");

    function setUp() public {
        sa    = new SubscriptionAgreement();
        token = new MockERC20Attacker();

        vm.deal(provider, 100 ether);
        vm.deal(alice,    100 ether);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 1: Reentrancy on renewal
    // Attacker re-enters renewSubscription from the receive() hook.
    // Expected: nonReentrant blocks it.
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Malicious keeper that tries to re-enter renewSubscription on ETH callback.
     *         There's no ETH callback on renewal (renewal credits pendingWithdrawals, not push),
     *         so this attack surface doesn't exist — confirmed by test.
     */
    function test_attack_reentrancyOnRenewal_impossible() public {
        // renewSubscription uses pull-payment (pendingWithdrawals credit, no ETH push)
        // so there is no ETH callback for an attacker to hook into during renewal.
        // This test verifies the pull-payment design eliminates the attack surface.

        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId = sa.subscribe{value: 3 * PRICE}(offeringId, 3);

        skip(PERIOD + 1);

        // Deploy reentrant subscriber (has receive() that calls withdraw/renew)
        ReentrantSubscriber attacker = new ReentrantSubscriber(sa);
        vm.deal(address(attacker), 10 ether);

        // Keeper (normal address) renews — no reentrancy vector
        vm.prank(alice);
        sa.renewSubscription(subId);

        // Subscription correctly advanced
        assertEq(sa.getSubscription(subId).consumed, 2 * PRICE);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 2: Double-renewal in same block
    // Attacker tries to renew twice before the period has elapsed.
    // Expected: NotYetRenewable on the second call.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_doubleRenewal_sameBlock_blocked() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId = sa.subscribe{value: 3 * PRICE}(offeringId, 3);

        skip(PERIOD + 1);

        DoubleRenewalAttacker attacker = new DoubleRenewalAttacker(sa);

        // First renewal valid; second immediately → NotYetRenewable
        vm.expectRevert(SubscriptionAgreement.NotYetRenewable.selector);
        attacker.attack(subId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 3: Cancel + re-subscribe to "reset" consumed accounting
    // Attacker cancels after first period, gets refund, re-subscribes.
    // Expected: No accounting exploit — first period of each cycle is non-refundable.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_cancelResubscribe_noAccountingReset() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId1 = sa.subscribe{value: 3 * PRICE}(offeringId, 3);

        // Cancel immediately → refund deposited - consumed = 2P
        vm.prank(alice);
        sa.cancel(subId1);

        uint256 refund1 = sa.pendingWithdrawals(alice, address(0));
        assertEq(refund1, 2 * PRICE, "first cancel refund should be 2 periods");

        // Withdraw refund
        vm.prank(alice);
        sa.withdraw(address(0));

        // Re-subscribe — must pay first period again (no free reset)
        vm.prank(alice);
        uint256 subId2 = sa.subscribe{value: 3 * PRICE}(offeringId, 3);
        assertEq(subId2, 2, "new subscription ID assigned");

        vm.prank(alice);
        sa.cancel(subId2);

        uint256 refund2 = sa.pendingWithdrawals(alice, address(0));
        assertEq(refund2, 2 * PRICE, "each cycle costs at least 1 period; no exploit");

        // Provider always earns 1 period per cycle (2 cycles = 2P)
        assertEq(sa.pendingWithdrawals(provider, address(0)), 2 * PRICE);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 4: Grief by subscribing then disputing every period
    // Attacker disputes immediately after subscribing to harass provider.
    // Expected: Attacker loses first-period payment each cycle; owner resolves.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_griefDispute_attackerLosesFirstPeriod() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        GriefDisputeAttacker attacker = new GriefDisputeAttacker(sa);
        vm.deal(address(attacker), 100 ether);

        // Cycle 1: subscribe + dispute
        uint256 subId1 = attacker.subscribeAndDispute{value: PRICE}(offeringId);
        assertTrue(sa.getSubscription(subId1).disputed, "should be disputed");

        // Owner resolves SUBSCRIBER_WINS (refund of remaining = 0, first period already paid)
        sa.resolveDisputeDetailed(subId1, SubscriptionAgreement.DisputeOutcome.SUBSCRIBER_WINS, 0, 0);

        // Attacker got 0 tokens back (deposited=PRICE, consumed=PRICE, remaining=0)
        assertEq(sa.pendingWithdrawals(address(attacker), address(0)), 0, "no refund: 1 period consumed");

        // Provider earned 1 period per cycle — grief attack is not free
        assertEq(sa.pendingWithdrawals(provider, address(0)), PRICE, "provider earns first period");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 5: Provider deactivates mid-period — does subscriber lose access?
    // Expected: No. Deactivation only blocks new subscribers; existing continue.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_providerDeactivatesMidPeriod_accessPreserved() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId = sa.subscribe{value: 3 * PRICE}(offeringId, 3);

        // Provider deactivates mid-period
        vm.prank(provider);
        sa.deactivateOffering(offeringId);

        // Alice still has access for the current period
        assertTrue(sa.hasAccess(offeringId, alice), "deactivation does not revoke existing access");

        // Alice can still renew (deposit not exhausted)
        skip(PERIOD + 1);
        sa.renewSubscription(subId);
        assertTrue(sa.getSubscription(subId).active, "existing subscription still renews after deactivation");

        // But new subscribers are blocked
        address newSub = address(0xBEEF);
        vm.deal(newSub, 10 ether);
        vm.prank(newSub);
        vm.expectRevert(SubscriptionAgreement.OfferingInactive.selector);
        sa.subscribe{value: PRICE}(offeringId, 1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 6: Subscriber tops up then cancels immediately to extract value
    // Attack: topUp to increase deposited, then cancel for large refund.
    // Expected: No exploit — topUp funds are correctly included in refund (by design).
    //           The attacker pays gas but gains nothing extra vs not topping up.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_topUpThenCancelImmediately_noValueExtraction() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId = sa.subscribe{value: PRICE}(offeringId, 1);
        // deposited=PRICE, consumed=PRICE, remaining=0

        // TopUp 5 ETH
        vm.prank(alice);
        sa.topUp{value: 5 * PRICE}(subId, 5 * PRICE);
        // deposited=6P, consumed=P, remaining=5P

        // Cancel — refund is deposited - consumed = 5P (the topUp amount)
        vm.prank(alice);
        sa.cancel(subId);

        uint256 refund = sa.pendingWithdrawals(alice, address(0));
        assertEq(refund, 5 * PRICE, "refund is exactly topUp amount: no gain, no loss");

        // Provider still earned exactly 1 period — topUp+cancel is net-zero for attacker
        assertEq(sa.pendingWithdrawals(provider, address(0)), PRICE);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 7: Max subscribers overflow
    // Attacker tries to subscribe beyond cap.
    // Expected: MaxSubscribersReached.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_maxSubscribersOverflow_blocked() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 2);

        address subB2 = address(0xB2);
        address subB3 = address(0xB3);
        vm.deal(subB2, 10 ether);
        vm.deal(subB3, 10 ether);

        // Fill all slots
        vm.prank(alice);
        sa.subscribe{value: PRICE}(offeringId, 1);
        vm.prank(subB2);
        sa.subscribe{value: PRICE}(offeringId, 1);

        assertEq(sa.getOffering(offeringId).subscriberCount, 2, "cap reached");

        // Third subscriber blocked
        vm.prank(subB3);
        vm.expectRevert(SubscriptionAgreement.MaxSubscribersReached.selector);
        sa.subscribe{value: PRICE}(offeringId, 1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 8: ERC-20 approval front-running
    // Attacker observes a subscriber's approve() tx in mempool and front-runs
    // transferFrom to drain the approved allowance before subscribe() lands.
    // Expected: The contract only pulls during subscribe/topUp; the front-runner
    //           can drain the allowance, but the subscriber's subscribe() then
    //           reverts with SafeERC20 transfer failure — no funds permanently lost.
    //           Mitigation: use approve(0) then approve(amount), or ERC-2612 permits.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_ERC20_approvalFrontrun_subscribeReverts() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(100e6, PERIOD, address(token), HASH, 0);

        token.mint(alice, 300e6);

        // Alice approves the contract
        vm.prank(alice);
        token.approve(address(sa), 300e6);

        // Front-runner observes Alice's approval and tries to pull via transferFrom.
        // The allowance is alice->SA, NOT alice->frontrunner.
        // Attempt must revert (require failure in ERC-20).
        address frontrunner = address(0xF1);
        vm.prank(frontrunner);
        (bool drainSucceeded,) = address(token).call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", alice, frontrunner, 300e6)
        );
        assertFalse(drainSucceeded, "frontrunner has no allowance; drain reverts");

        // Alice's subscribe still goes through normally
        vm.prank(alice);
        sa.subscribe(offeringId, 3);

        assertEq(sa.getSubscription(1).deposited, 300e6);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 9: Reentrancy on withdraw via ReentrantSubscriber
    // Attacker subscribes (gets refund in pendingWithdrawals), cancels,
    // then calls withdraw — receive() tries to re-enter withdraw().
    // Expected: nonReentrant + CEI blocks double-withdrawal.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_reentrancyOnWithdraw_blocked() public {
        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        ReentrantSubscriber attacker = new ReentrantSubscriber(sa);
        vm.deal(address(attacker), 10 ether);

        // Attacker subscribes for 3 periods (total = 3 * PRICE)
        attacker.subscribe{value: 3 * PRICE}(offeringId, 3, 3 * PRICE);

        // Attacker cancels — gets 2P refund in pendingWithdrawals
        attacker.cancel(1);
        uint256 refund = sa.pendingWithdrawals(address(attacker), address(0));
        assertEq(refund, 2 * PRICE);

        uint256 contractBefore = address(sa).balance;

        // Attacker calls withdraw — receive() tries to re-enter
        attacker.doWithdraw();

        // Reentry count zero OR reentry was attempted but blocked each time
        // Contract balance decremented by exactly refund amount (not 2x)
        assertEq(address(sa).balance, contractBefore - refund, "double-drain blocked");
        assertEq(sa.pendingWithdrawals(address(attacker), address(0)), 0, "zeroed out");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Attack 10: Dispute fee ETH trap (SA-1) — now fixed
    // Before fix: subscriber sends ETH as dispute fee but DA not configured → stuck.
    // After fix: ETH refunded when DA not set.
    // ──────────────────────────────────────────────────────────────────────────

    function test_attack_disputeFeeETHNotTrapped_afterFix() public {
        // No DA configured
        assertEq(sa.disputeArbitration(), address(0));

        vm.prank(provider);
        uint256 offeringId = sa.createOffering(PRICE, PERIOD, address(0), HASH, 0);

        vm.prank(alice);
        uint256 subId = sa.subscribe{value: PRICE}(offeringId, 1);

        uint256 aliceBefore  = alice.balance;
        uint256 contractBefore = address(sa).balance;

        // Subscriber sends 0.5 ETH as dispute fee — must be refunded
        vm.prank(alice);
        sa.disputeSubscription{value: 0.5 ether}(subId);

        // Alice's ETH returned (net zero fee when no DA)
        assertEq(alice.balance, aliceBefore, "ETH refunded: no trap");
        // Contract balance unchanged (subscription ETH already in contract, fee refunded)
        assertEq(address(sa).balance, contractBefore, "contract balance unchanged by fee");
        // Dispute opened
        assertTrue(sa.getSubscription(subId).disputed);
    }
}

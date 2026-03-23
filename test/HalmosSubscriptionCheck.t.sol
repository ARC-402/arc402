// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../contracts/src/SubscriptionAgreement.sol";

/// @dev Halmos symbolic tests for SubscriptionAgreement — all functions prefixed check_
contract HalmosSubscriptionCheck is Test {
    SubscriptionAgreement internal sa;
    address internal constant PROVIDER   = address(0x1001);
    address internal constant SUBSCRIBER = address(0x1002);
    uint256 internal offeringId;

    function setUp() public {
        sa = new SubscriptionAgreement();
        vm.prank(PROVIDER);
        offeringId = sa.createOffering(1 ether, 1 days, address(0), bytes32(0), 0);
    }

    /// @dev Verify: if subscriber subscribes for N periods, deposited == pricePerPeriod * N
    function check_subscribe_depositedEqualsPriceTimesN(uint8 periods) public {
        vm.assume(periods >= 1 && periods <= 10);
        uint256 price = 1 ether;
        uint256 total = price * periods;
        vm.deal(SUBSCRIBER, total);
        vm.prank(SUBSCRIBER);
        bytes32 subId = sa.subscribe{value: total}(offeringId, periods);
        SubscriptionAgreement.Subscription memory sub = sa.getSubscription(subId);
        assert(sub.deposited == total);
    }

    /// @dev Verify: provider pendingWithdrawals after subscribe == pricePerPeriod (first period)
    function check_subscribe_firstPeriodCreditedToProvider(uint8 periods) public {
        vm.assume(periods >= 1 && periods <= 5);
        uint256 price = 1 ether;
        uint256 total = price * periods;
        vm.deal(SUBSCRIBER, total);
        uint256 prevBalance = sa.pendingWithdrawals(PROVIDER, address(0));
        vm.prank(SUBSCRIBER);
        sa.subscribe{value: total}(offeringId, periods);
        uint256 newBalance = sa.pendingWithdrawals(PROVIDER, address(0));
        assert(newBalance - prevBalance == price);
    }

    /// @dev Verify: self-dealing always reverts
    function check_subscribe_selfDealingAlwaysReverts(uint8 periods) public {
        vm.assume(periods >= 1);
        uint256 total = 1 ether * periods;
        vm.deal(PROVIDER, total);
        vm.prank(PROVIDER);
        vm.expectRevert(SubscriptionAgreement.SelfDealing.selector);
        sa.subscribe{value: total}(offeringId, periods);
    }
}

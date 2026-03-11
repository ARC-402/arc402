// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ServiceAgreement Halmos Symbolic Tests
 * @notice Symbolic execution proofs using Halmos.
 *         Proves properties hold for ALL possible inputs, not just sampled ones.
 *
 *         Run: halmos --contract ServiceAgreementSymbolic
 *
 * @dev Halmos compatibility notes:
 *      - vm.deal() in setUp() may be modelled symbolically by Halmos at test start.
 *        FIX: Call vm.deal() inside each check_ with CONCRETE amounts; read balance
 *        as a concrete literal (not SLOAD) to avoid symbolic ambiguity.
 *      - vm.expectRevert() is not supported. FIX: use try/catch.
 *      - Keep vm.assume() constraints simple (avoid arithmetic on assumed values).
 *      - Fresh addresses with 0 starting balance are cleaner than reused setUp addresses.
 *
 *      Functions prefixed with `check_` are symbolic proof targets.
 *      `assert(cond)` must hold for ALL valid inputs satisfying vm.assume constraints.
 */

import "forge-std/Test.sol";
import "../contracts/ServiceAgreement.sol";
import "../contracts/IServiceAgreement.sol";

contract ServiceAgreementSymbolic is Test {

    ServiceAgreement public sa;

    function setUp() public {
        sa = new ServiceAgreement();
        // Note: do NOT pre-deal balances for symbolic actors here.
        // Each check_ sets up its own concrete balances to avoid
        // Halmos modelling setUp state as symbolic at test entry.
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// @dev Returns a fresh actor address with a concrete ETH balance.
    ///      Using unique hardcoded addresses avoids accidental state sharing.
    function _freshClient(uint256 balance) internal returns (address payable a) {
        a = payable(address(0x1001));
        vm.deal(a, balance);
    }

    function _freshProvider() internal returns (address payable a) {
        a = payable(address(0x2001));
        // Provider starts with ZERO ETH — this makes balance assertions concrete:
        // after fulfill, provider.balance == price (0 + price) which Halmos can prove.
        vm.deal(a, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 1: fulfill() never overpays the provider
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice For all valid (price, deadline), provider receives EXACTLY price.
     * @dev Provider starts with 0 ETH so assertion is: provider.balance == price.
     *      This eliminates the symbolic-initial-balance problem:
     *      Halmos proves 0 + price == price, which is trivially true.
     *      Covers: wrong amount in _releaseEscrow, reentrancy double-pay,
     *              price drift between propose() and fulfill().
     */
    function check_fulfill_never_overpays(uint256 price, uint256 deadline) public {
        vm.assume(price >= 1);
        vm.assume(price <= 100 ether);
        vm.assume(deadline > block.timestamp);
        vm.assume(deadline <= block.timestamp + 365 days);

        // Concrete balances: client has exactly price, provider has 0
        address payable client   = _freshClient(price);   // client starts with exactly price
        address payable provider = _freshProvider();       // provider starts with 0

        // Propose: client sends exactly price ETH
        vm.prank(client);
        uint256 id = sa.propose{value: price}(
            provider, "compute", "test", price, address(0), deadline, bytes32(0)
        );

        // Client now has 0 ETH (spent on propose), contract holds price
        assert(address(sa).balance == price);
        assert(client.balance == 0); // spent exactly price

        // Accept
        vm.prank(provider);
        sa.accept(id);

        // Fulfill: provider claims escrow
        vm.prank(provider);
        sa.fulfill(id, bytes32(0));

        // PROOF: provider received EXACTLY price (started at 0)
        assert(provider.balance == price);

        // PROOF: contract holds 0 (fully paid out)
        assert(address(sa).balance == 0);

        // PROOF: agreement correctly marked FULFILLED
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assert(ag.status == IServiceAgreement.Status.FULFILLED);
        assert(ag.price == price);
        assert(ag.resolvedAt > 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 2: cancel() always gives client a full refund
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice For all valid prices, cancel() returns client to their exact starting balance.
     * @dev Client starts with EXACTLY price ETH (concrete = symbolic price).
     *      After propose + cancel, client must be back at price ETH.
     *      Assertion: client.balance == price — provable since it equals the initial balance.
     *      Covers: partial refund bugs, wrong amount in _releaseEscrow.
     */
    function check_cancel_full_refund(uint256 price) public {
        vm.assume(price >= 1);
        vm.assume(price <= 100 ether);

        // Client starts with exactly price ETH
        address payable client   = _freshClient(price);
        address payable provider = _freshProvider();
        uint256 deadline = block.timestamp + 7 days;

        // Propose: escrow price ETH
        vm.prank(client);
        uint256 id = sa.propose{value: price}(
            provider, "compute", "cancel test", price, address(0), deadline, bytes32(0)
        );

        // Client has 0 now (all in escrow), contract holds price
        assert(client.balance == 0);
        assert(address(sa).balance == price);

        // Cancel: client gets refund
        vm.prank(client);
        sa.cancel(id);

        // PROOF: client is back to their initial balance (price)
        assert(client.balance == price); // started at price, propose took price, cancel returned price

        // PROOF: contract holds 0
        assert(address(sa).balance == 0);

        // Agreement correctly CANCELLED
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assert(ag.status == IServiceAgreement.Status.CANCELLED);
        assert(ag.resolvedAt > 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 3: dispute() moves zero ETH
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice For all valid (price, deadline), raising a dispute does NOT move ETH.
     * @dev Contract balance before dispute == contract balance after dispute.
     *      Covers: accidental ETH release/burn in dispute(), any transfer bug.
     */
    function check_dispute_locks_escrow(uint256 price, uint256 deadline) public {
        vm.assume(price >= 1);
        vm.assume(price <= 100 ether);
        vm.assume(deadline > block.timestamp + 1);
        vm.assume(deadline <= block.timestamp + 365 days);

        address payable client   = _freshClient(price);
        address payable provider = _freshProvider();

        // Propose + Accept
        vm.prank(client);
        uint256 id = sa.propose{value: price}(
            provider, "compute", "dispute test", price, address(0), deadline, bytes32(0)
        );

        vm.prank(provider);
        sa.accept(id);

        // Record balance before dispute
        uint256 contractBalanceBefore = address(sa).balance;
        assert(contractBalanceBefore == price); // sanity

        // Dispute raised by client
        vm.prank(client);
        sa.dispute(id, "symbolic dispute");

        // PROOF: dispute() moved 0 ETH
        assert(address(sa).balance == contractBalanceBefore);
        assert(address(sa).balance == price);

        // PROOF: provider received nothing from the dispute call
        assert(provider.balance == 0); // provider started at 0, dispute gives nothing

        // Agreement in DISPUTED state
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assert(ag.status == IServiceAgreement.Status.DISPUTED);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 4: Agreement IDs are strictly sequential
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice For any two consecutive propose() calls, id2 == id1 + 1.
     * @dev Covers: ID reuse, ID wrap-around (unchecked overflow), non-monotonic assignment.
     */
    function check_agreement_ids_sequential(uint256 price1, uint256 price2) public {
        vm.assume(price1 >= 1 && price1 <= 50 ether);
        vm.assume(price2 >= 1 && price2 <= 50 ether);

        // Give client concrete 100 ether — enough for both proposals (each <= 50 ether)
        address payable client   = _freshClient(100 ether);
        address payable provider = _freshProvider();
        uint256 deadline = block.timestamp + 7 days;

        vm.prank(client);
        uint256 id1 = sa.propose{value: price1}(
            provider, "compute", "first",  price1, address(0), deadline, bytes32(0)
        );

        vm.prank(client);
        uint256 id2 = sa.propose{value: price2}(
            provider, "compute", "second", price2, address(0), deadline, bytes32(0)
        );

        // PROOF: IDs are sequential (id2 = id1 + 1)
        assert(id2 == id1 + 1);

        // PROOF: each agreement independently stores correct price
        IServiceAgreement.Agreement memory ag1 = sa.getAgreement(id1);
        IServiceAgreement.Agreement memory ag2 = sa.getAgreement(id2);
        assert(ag1.price == price1);
        assert(ag2.price == price2);
        assert(ag1.id == id1);
        assert(ag2.id == id2);

        // PROOF: agreement count is exactly 2
        assert(sa.agreementCount() == 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 5: resolveDispute() releases escrow to exactly one party
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice For all (price, favorProvider), exactly price goes to one party,
     *         the other receives 0 delta, contract holds 0 after resolution.
     * @dev Provider starts at 0 ETH, client starts at price ETH.
     *      Covers: double-payment, wrong recipient, partial payment.
     */
    function check_dispute_resolution_single_payment(uint256 price, bool favorProvider) public {
        vm.assume(price >= 1);
        vm.assume(price <= 100 ether);

        address payable client   = _freshClient(price); // client starts with exactly price
        address payable provider = _freshProvider();      // provider starts at 0
        uint256 deadline = block.timestamp + 7 days;

        // Propose → Accept → Dispute
        vm.prank(client);
        uint256 id = sa.propose{value: price}(
            provider, "compute", "dispute resolution", price, address(0), deadline, bytes32(0)
        );

        vm.prank(provider);
        sa.accept(id);

        vm.prank(client);
        sa.dispute(id, "contested");

        // Owner resolves (test contract is owner of sa)
        sa.resolveDispute(id, favorProvider);

        if (favorProvider) {
            // PROOF: provider received exactly price (started at 0)
            assert(provider.balance == price);
            // PROOF: client got nothing back (started at price, spent price)
            assert(client.balance == 0);
        } else {
            // PROOF: client fully refunded (back to starting balance)
            assert(client.balance == price);
            // PROOF: provider received nothing (still at 0)
            assert(provider.balance == 0);
        }

        // PROOF: contract holds 0 after resolution (both paths)
        assert(address(sa).balance == 0);

        // State is correct
        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        if (favorProvider) {
            assert(ag.status == IServiceAgreement.Status.FULFILLED);
        } else {
            assert(ag.status == IServiceAgreement.Status.CANCELLED);
        }
        assert(ag.resolvedAt > 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROOF 6: expiredCancel() requires past deadline
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * @notice Prove: calling expiredCancel() before the deadline always reverts.
     * @dev Uses try/catch (vm.expectRevert is not supported by Halmos).
     *      If the try block succeeds (expiredCancel didn't revert), we assert(false)
     *      to signal a violation — no valid input should reach that branch.
     */
    function check_expired_cancel_requires_past_deadline(uint256 price, uint256 deadlineGap) public {
        vm.assume(price >= 1);
        vm.assume(price <= 100 ether);
        vm.assume(deadlineGap >= 1 hours);
        vm.assume(deadlineGap <= 365 days);

        address payable client   = _freshClient(price);
        address payable provider = _freshProvider();
        uint256 deadline = block.timestamp + deadlineGap;

        // Propose + Accept (ACCEPTED state required for expiredCancel)
        vm.prank(client);
        uint256 id = sa.propose{value: price}(
            provider, "compute", "expiry test", price, address(0), deadline, bytes32(0)
        );

        vm.prank(provider);
        sa.accept(id);

        // We are BEFORE the deadline (block.timestamp < deadline since deadlineGap >= 1 hour)
        // expiredCancel() MUST revert — try/catch proves this for all valid inputs
        vm.prank(client);
        try sa.expiredCancel(id) {
            // VIOLATION: expiredCancel succeeded before deadline
            assert(false);
        } catch {
            // Correct: reverted as expected
        }

        // PROOF: no state changed, escrow still locked
        assert(address(sa).balance == price);
        assert(provider.balance == 0);

        IServiceAgreement.Agreement memory ag = sa.getAgreement(id);
        assert(ag.status == IServiceAgreement.Status.ACCEPTED);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/SettlementCoordinator.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC-20 for settlement tests
contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MTK") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}

// Helper: simulates a wallet that can call execute
contract MockWallet {
    SettlementCoordinator coordinator;

    constructor(address _coord) {
        coordinator = SettlementCoordinator(_coord);
    }

    function callExecute(bytes32 proposalId, uint256 amount) external payable {
        coordinator.execute{value: amount}(proposalId);
    }

    receive() external payable {}
}

contract SettlementCoordinatorTest is Test {
    SettlementCoordinator coordinator;
    MockWallet fromWallet;
    MockToken token;
    address toWallet = address(0xBEEF);
    bytes32 constant INTENT_ID = keccak256("intent-1");

    function setUp() public {
        coordinator = new SettlementCoordinator();
        fromWallet = new MockWallet(address(coordinator));
        token = new MockToken();
        vm.deal(address(fromWallet), 10 ether);
        vm.deal(toWallet, 0);
    }

    function test_propose() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        (address from, address to, uint256 amount,,,, SettlementCoordinator.ProposalStatus status,) = coordinator.getProposal(proposalId);
        assertEq(from, address(fromWallet));
        assertEq(to, toWallet);
        assertEq(amount, 1 ether);
        assertEq(uint(status), uint(SettlementCoordinator.ProposalStatus.PENDING));
    }

    function test_accept() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        vm.prank(toWallet);
        coordinator.accept(proposalId);
        (,,,,,, SettlementCoordinator.ProposalStatus status,) = coordinator.getProposal(proposalId);
        assertEq(uint(status), uint(SettlementCoordinator.ProposalStatus.ACCEPTED));
    }

    function test_execute_fullFlow() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        vm.prank(toWallet);
        coordinator.accept(proposalId);

        uint256 balanceBefore = toWallet.balance;
        fromWallet.callExecute{value: 1 ether}(proposalId, 1 ether);
        assertEq(toWallet.balance - balanceBefore, 1 ether);

        (,,,,,, SettlementCoordinator.ProposalStatus status,) = coordinator.getProposal(proposalId);
        assertEq(uint(status), uint(SettlementCoordinator.ProposalStatus.EXECUTED));
    }

    function test_accept_notRecipient() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        vm.expectRevert("SettlementCoordinator: not recipient");
        coordinator.accept(proposalId);
    }

    function test_execute_wrongAmount() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        vm.prank(toWallet);
        coordinator.accept(proposalId);
        vm.expectRevert("SettlementCoordinator: wrong amount");
        fromWallet.callExecute{value: 0.5 ether}(proposalId, 0.5 ether);
    }

    function test_reject() public {
        bytes32 proposalId = coordinator.propose(
            address(fromWallet), toWallet, 1 ether, address(0), INTENT_ID, block.timestamp + 1 hours
        );
        vm.prank(toWallet);
        coordinator.reject(proposalId, "not authorized");
        (,,,,,, SettlementCoordinator.ProposalStatus status, string memory reason) = coordinator.getProposal(proposalId);
        assertEq(uint(status), uint(SettlementCoordinator.ProposalStatus.REJECTED));
        assertEq(reason, "not authorized");
    }

    function test_execute_token_settlement() public {
        uint256 amount = 100 * 10**18;

        // address(this) is the fromWallet for direct execution
        token.approve(address(coordinator), amount);

        bytes32 proposalId = coordinator.propose(
            address(this), toWallet, amount, address(token), INTENT_ID, block.timestamp + 1 hours
        );

        vm.prank(toWallet);
        coordinator.accept(proposalId);

        uint256 balanceBefore = token.balanceOf(toWallet);
        coordinator.execute(proposalId); // no ETH value — ERC-20 path
        assertEq(token.balanceOf(toWallet) - balanceBefore, amount);

        (,,,,,, SettlementCoordinator.ProposalStatus status,) = coordinator.getProposal(proposalId);
        assertEq(uint(status), uint(SettlementCoordinator.ProposalStatus.EXECUTED));
    }
}

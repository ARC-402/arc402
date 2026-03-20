// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/Handshake.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 for testing token handshakes.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000e6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract HandshakeTest is Test {
    Handshake public hs;
    MockUSDC public usdc;

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave  = makeAddr("dave");

    function setUp() public {
        // Warp to a realistic timestamp so cooldown checks don't fail
        // against default-zero lastHandshakeAt values
        vm.warp(1_700_000_000);
        hs = new Handshake();
        usdc = new MockUSDC();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Give alice some USDC and approve the handshake contract
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(hs), type(uint256).max);

        // Allow USDC on the handshake contract
        hs.setAllowedToken(address(usdc), true);
    }

    // ─── Basic handshake ──────────────────────────────────────────────────

    function test_sendHandshake_basic() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "gm");

        assertEq(hs.totalHandshakes(), 1);
        assertEq(hs.sentCount(alice), 1);
        assertEq(hs.receivedCount(bob), 1);
        assertEq(hs.uniqueSenders(bob), 1);
        assertTrue(hs.hasConnection(alice, bob));
        assertFalse(hs.hasConnection(bob, alice));
    }

    function test_sendHandshake_withETH() public {
        uint256 bobBefore = bob.balance;

        vm.prank(alice);
        hs.sendHandshake{value: 0.01 ether}(bob, Handshake.HandshakeType.Thanks, "appreciate you");

        assertEq(bob.balance, bobBefore + 0.01 ether);
        assertEq(address(hs).balance, 0); // contract holds nothing
    }

    function test_sendHandshake_emptyNote() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Hello, "");

        assertEq(hs.totalHandshakes(), 1);
    }

    // ─── Events ───────────────────────────────────────────────────────────

    function test_emitsHandshakeSent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit Handshake.HandshakeSent(1, alice, bob, 0, address(0), 0, "gm", block.timestamp);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "gm");
    }

    function test_emitsNewConnection_onFirstHandshake() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Handshake.NewConnection(alice, bob, 1);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "first");
    }

    function test_noNewConnection_onRepeat() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "first");

        // Wait for cooldown
        vm.warp(block.timestamp + 1 hours + 1);

        // Second handshake should NOT emit NewConnection
        vm.prank(alice);
        // We just verify it doesn't revert and uniqueSenders stays at 1
        hs.sendHandshake(bob, Handshake.HandshakeType.Curiosity, "second");

        assertEq(hs.uniqueSenders(bob), 1); // still 1, not 2
        assertEq(hs.sentCount(alice), 2);
    }

    // ─── Mutual detection ─────────────────────────────────────────────────

    function test_isMutual() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");

        assertFalse(hs.isMutual(alice, bob));

        vm.prank(bob);
        hs.sendHandshake(alice, Handshake.HandshakeType.Respect, "");

        assertTrue(hs.isMutual(alice, bob));
        assertTrue(hs.isMutual(bob, alice));
    }

    // ─── Anti-spam: self-handshake ────────────────────────────────────────

    function test_revert_selfHandshake() public {
        vm.prank(alice);
        vm.expectRevert("Handshake: cannot self-handshake");
        hs.sendHandshake(alice, Handshake.HandshakeType.Respect, "");
    }

    // ─── Anti-spam: zero address ──────────────────────────────────────────

    function test_revert_zeroAddress() public {
        vm.prank(alice);
        vm.expectRevert("Handshake: zero address");
        hs.sendHandshake(address(0), Handshake.HandshakeType.Respect, "");
    }

    // ─── Anti-spam: note too long ─────────────────────────────────────────

    function test_revert_noteTooLong() public {
        // 281 bytes
        bytes memory longNote = new bytes(281);
        vm.prank(alice);
        vm.expectRevert("Handshake: note too long");
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, string(longNote));
    }

    // ─── Anti-spam: pair cooldown ─────────────────────────────────────────

    function test_revert_pairCooldown() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");

        vm.prank(alice);
        vm.expectRevert("Handshake: cooldown not met");
        hs.sendHandshake(bob, Handshake.HandshakeType.Curiosity, "");
    }

    function test_pairCooldown_allowsAfterWait() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Curiosity, "checking in");

        assertEq(hs.sentCount(alice), 2);
    }

    // ─── Anti-spam: daily cap ─────────────────────────────────────────────

    function test_revert_dailyCap() public {
        // Send 50 handshakes to different recipients
        for (uint256 i = 0; i < 50; i++) {
            address recipient = address(uint160(1000 + i));
            vm.prank(alice);
            hs.sendHandshake(recipient, Handshake.HandshakeType.Hello, "");
        }

        // 51st should fail
        address extra = address(uint160(2000));
        vm.prank(alice);
        vm.expectRevert("Handshake: daily cap reached");
        hs.sendHandshake(extra, Handshake.HandshakeType.Hello, "");
    }

    function test_dailyCap_resetsAfter24h() public {
        for (uint256 i = 0; i < 50; i++) {
            address recipient = address(uint160(1000 + i));
            vm.prank(alice);
            hs.sendHandshake(recipient, Handshake.HandshakeType.Hello, "");
        }

        vm.warp(block.timestamp + 1 days + 1);

        // Should work again
        address newRecipient = address(uint160(3000));
        vm.prank(alice);
        hs.sendHandshake(newRecipient, Handshake.HandshakeType.Hello, "new day");

        assertEq(hs.dailyCount(alice), 1);
    }

    // ─── Batch ────────────────────────────────────────────────────────────

    function test_sendBatch_basic() public {
        address[] memory recipients = new address[](3);
        recipients[0] = bob;
        recipients[1] = carol;
        recipients[2] = dave;

        Handshake.HandshakeType[] memory types = new Handshake.HandshakeType[](3);
        types[0] = Handshake.HandshakeType.Respect;
        types[1] = Handshake.HandshakeType.Curiosity;
        types[2] = Handshake.HandshakeType.Hello;

        string[] memory notes = new string[](3);
        notes[0] = "gm";
        notes[1] = "interesting work";
        notes[2] = "hey";

        vm.prank(alice);
        hs.sendBatch(recipients, types, notes);

        assertEq(hs.totalHandshakes(), 3);
        assertEq(hs.sentCount(alice), 3);
        assertEq(hs.receivedCount(bob), 1);
        assertEq(hs.receivedCount(carol), 1);
        assertEq(hs.receivedCount(dave), 1);
        assertTrue(hs.hasConnection(alice, bob));
        assertTrue(hs.hasConnection(alice, carol));
        assertTrue(hs.hasConnection(alice, dave));
    }

    function test_revert_batch_tooMany() public {
        address[] memory recipients = new address[](11);
        Handshake.HandshakeType[] memory types = new Handshake.HandshakeType[](11);
        string[] memory notes = new string[](11);

        for (uint256 i = 0; i < 11; i++) {
            recipients[i] = address(uint160(1000 + i));
            types[i] = Handshake.HandshakeType.Hello;
            notes[i] = "";
        }

        vm.prank(alice);
        vm.expectRevert("Handshake: batch 1-10");
        hs.sendBatch(recipients, types, notes);
    }

    function test_revert_batch_lengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;

        Handshake.HandshakeType[] memory types = new Handshake.HandshakeType[](1);
        types[0] = Handshake.HandshakeType.Hello;

        string[] memory notes = new string[](2);
        notes[0] = "";
        notes[1] = "";

        vm.prank(alice);
        vm.expectRevert("Handshake: type length mismatch");
        hs.sendBatch(recipients, types, notes);
    }

    function test_revert_batch_selfHandshake() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;

        Handshake.HandshakeType[] memory types = new Handshake.HandshakeType[](1);
        types[0] = Handshake.HandshakeType.Hello;

        string[] memory notes = new string[](1);
        notes[0] = "";

        vm.prank(alice);
        vm.expectRevert("Handshake: cannot self-handshake");
        hs.sendBatch(recipients, types, notes);
    }

    // ─── Pause ────────────────────────────────────────────────────────────

    function test_pause_blocksHandshake() public {
        hs.pause();

        vm.prank(alice);
        vm.expectRevert("Handshake: paused");
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");
    }

    function test_unpause_allowsHandshake() public {
        hs.pause();
        hs.unpause();

        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");
        assertEq(hs.totalHandshakes(), 1);
    }

    // ─── Stats ────────────────────────────────────────────────────────────

    function test_getStats() public {
        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Respect, "");

        vm.prank(carol);
        hs.sendHandshake(bob, Handshake.HandshakeType.Curiosity, "");

        (uint256 sent, uint256 received, uint256 unique) = hs.getStats(bob);
        assertEq(sent, 0);
        assertEq(received, 2);
        assertEq(unique, 2);
    }

    // ─── IDs increment correctly ──────────────────────────────────────────

    function test_handshakeIds_increment() public {
        assertEq(hs.nextHandshakeId(), 1);

        vm.prank(alice);
        hs.sendHandshake(bob, Handshake.HandshakeType.Hello, "");
        assertEq(hs.nextHandshakeId(), 2);

        vm.prank(bob);
        hs.sendHandshake(alice, Handshake.HandshakeType.Hello, "");
        assertEq(hs.nextHandshakeId(), 3);
    }

    // ─── All handshake types work ─────────────────────────────────────────

    function test_allHandshakeTypes() public {
        for (uint8 i = 0; i <= 7; i++) {
            address recipient = address(uint160(5000 + i));
            vm.prank(alice);
            hs.sendHandshake(recipient, Handshake.HandshakeType(i), "");
        }
        assertEq(hs.totalHandshakes(), 8);
    }

    // ─── ERC-20 (USDC) handshakes ─────────────────────────────────────────

    function test_sendHandshakeWithToken_basic() public {
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(alice);
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Thanks, "great work", address(usdc), 100e6);

        assertEq(usdc.balanceOf(bob), bobBefore + 100e6);
        assertEq(hs.totalHandshakes(), 1);
        assertEq(hs.sentCount(alice), 1);
        assertEq(hs.receivedCount(bob), 1);
        assertTrue(hs.hasConnection(alice, bob));
    }

    function test_sendHandshakeWithToken_contractHoldsNothing() public {
        vm.prank(alice);
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Endorsement, "", address(usdc), 50e6);

        assertEq(usdc.balanceOf(address(hs)), 0);
    }

    function test_revert_tokenNotAllowed() public {
        MockUSDC fakeToken = new MockUSDC();
        fakeToken.mint(alice, 1000e6);
        vm.prank(alice);
        fakeToken.approve(address(hs), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert("Handshake: token not allowed");
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Hello, "", address(fakeToken), 10e6);
    }

    function test_revert_tokenZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("Handshake: zero token amount");
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Hello, "", address(usdc), 0);
    }

    function test_revert_tokenSelfHandshake() public {
        vm.prank(alice);
        vm.expectRevert("Handshake: cannot self-handshake");
        hs.sendHandshakeWithToken(alice, Handshake.HandshakeType.Hello, "", address(usdc), 10e6);
    }

    function test_revert_tokenUseETHSentinel() public {
        vm.prank(alice);
        vm.expectRevert("Handshake: use sendHandshake for ETH");
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Hello, "", address(0), 10e6);
    }

    function test_setAllowedToken() public {
        MockUSDC newToken = new MockUSDC();
        assertFalse(hs.allowedTokens(address(newToken)));

        hs.setAllowedToken(address(newToken), true);
        assertTrue(hs.allowedTokens(address(newToken)));

        hs.setAllowedToken(address(newToken), false);
        assertFalse(hs.allowedTokens(address(newToken)));
    }

    function test_revert_setAllowedToken_zeroAddress() public {
        vm.expectRevert("Handshake: use ETH natively");
        hs.setAllowedToken(address(0), true);
    }

    function test_tokenHandshake_respectsCooldown() public {
        vm.prank(alice);
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Thanks, "", address(usdc), 10e6);

        vm.prank(alice);
        vm.expectRevert("Handshake: cooldown not met");
        hs.sendHandshakeWithToken(bob, Handshake.HandshakeType.Respect, "", address(usdc), 5e6);
    }

    function test_tokenHandshake_respectsDailyCap() public {
        for (uint256 i = 0; i < 50; i++) {
            address recipient = address(uint160(8000 + i));
            vm.prank(alice);
            hs.sendHandshakeWithToken(recipient, Handshake.HandshakeType.Hello, "", address(usdc), 1e6);
        }

        address extra = address(uint160(9000));
        vm.prank(alice);
        vm.expectRevert("Handshake: daily cap reached");
        hs.sendHandshakeWithToken(extra, Handshake.HandshakeType.Hello, "", address(usdc), 1e6);
    }
}

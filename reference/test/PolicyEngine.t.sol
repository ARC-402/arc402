// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/PolicyEngine.sol";

contract PolicyEngineTest is Test {
    PolicyEngine engine;
    address wallet = address(0x1234);

    function setUp() public {
        engine = new PolicyEngine();
        engine.registerWallet(wallet, address(this));
    }

    function test_setCategoryLimit() public {
        vm.prank(wallet);
        engine.setCategoryLimit("claims", 1 ether);
        assertEq(engine.categoryLimits(wallet, "claims"), 1 ether);
    }

    function test_validateSpend_pass() public {
        vm.prank(wallet);
        engine.setCategoryLimit("claims", 1 ether);
        (bool valid, string memory reason) = engine.validateSpend(wallet, "claims", 0.5 ether, bytes32(0));
        assertTrue(valid);
        assertEq(reason, "");
    }

    function test_validateSpend_exceedsLimit() public {
        vm.prank(wallet);
        engine.setCategoryLimit("claims", 0.1 ether);
        (bool valid, string memory reason) = engine.validateSpend(wallet, "claims", 0.5 ether, bytes32(0));
        assertFalse(valid);
        assertEq(reason, "PolicyEngine: amount exceeds category limit");
    }

    function test_validateSpend_categoryNotConfigured() public {
        (bool valid, string memory reason) = engine.validateSpend(wallet, "unknown", 0.1 ether, bytes32(0));
        assertFalse(valid);
        assertEq(reason, "PolicyEngine: category not configured");
    }

    function test_setCategoryLimitFor() public {
        engine.setCategoryLimitFor(wallet, "claims", 2 ether);
        assertEq(engine.categoryLimits(wallet, "claims"), 2 ether);
    }
}

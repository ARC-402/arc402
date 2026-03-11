// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../contracts/IntentAttestation.sol";

contract IntentAttestationTest is Test {
    IntentAttestation attestor;
    bytes32 constant ID = keccak256("test-intent-1");

    function setUp() public {
        attestor = new IntentAttestation();
    }

    function test_attest_and_verify() public {
        attestor.attest(ID, "pay_provider", "Test payment", address(0x999), 0.1 ether, address(0));
        assertTrue(attestor.verify(ID, address(this)));
    }

    function test_verify_wrongWallet() public {
        attestor.attest(ID, "pay_provider", "Test payment", address(0x999), 0.1 ether, address(0));
        assertFalse(attestor.verify(ID, address(0x1234)));
    }

    function test_verify_nonexistentAttestation() public {
        assertFalse(attestor.verify(bytes32(0), address(this)));
    }

    function test_immutability_cannotReattest() public {
        attestor.attest(ID, "pay_provider", "Test payment", address(0x999), 0.1 ether, address(0));
        vm.expectRevert("IntentAttestation: already exists");
        attestor.attest(ID, "pay_provider_2", "Different", address(0x999), 0.2 ether, address(0));
    }

    function test_getAttestation() public {
        attestor.attest(ID, "acquire_records", "Medical records for claim", address(0x999), 0.05 ether, address(0));
        (bytes32 id, address wallet, string memory action, string memory reason, address recipient, uint256 amount, address token,) = attestor.getAttestation(ID);
        assertEq(id, ID);
        assertEq(wallet, address(this));
        assertEq(action, "acquire_records");
        assertEq(reason, "Medical records for claim");
        assertEq(recipient, address(0x999));
        assertEq(amount, 0.05 ether);
        assertEq(token, address(0));
    }

    function test_attest_withToken() public {
        address usdc = address(0x036CbD53842c5426634e7929541eC2318f3dCF7e);
        attestor.attest(ID, "api_call", "x402 payment for API access", address(0x999), 1_000_000, usdc);
        (,,,,,, address token,) = attestor.getAttestation(ID);
        assertEq(token, usdc);
    }
}

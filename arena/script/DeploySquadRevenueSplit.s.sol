// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/SquadRevenueSplit.sol";

/**
 * @title DeploySquadRevenueSplit
 * @notice Deploys a SquadRevenueSplit contract for a research squad.
 *
 *         SquadRevenueSplit is deployed once per squad artifact — not a singleton.
 *         The LEAD deploys one before registering an artifact in IntelligenceRegistry.
 *
 * Required environment variables:
 *   USDC_ADDRESS    — USDC token address (Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
 *   AGENT_REGISTRY  — AgentRegistry contract address
 *   RECIPIENTS      — Comma-separated list of recipient addresses
 *                     e.g. "0xAddr1,0xAddr2,0xAddr3"
 *   SHARES          — Comma-separated shares in basis points (must sum to 10000)
 *                     e.g. "4000,3000,3000"
 *
 * Usage:
 *   forge script script/DeploySquadRevenueSplit.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY \
 *     -vvvv
 *
 * CLI equivalent (when arc402 arena split create is built):
 *   arc402 arena split create \
 *     --recipients "0xAddr1,0xAddr2,0xAddr3" \
 *     --shares "4000,3000,3000"
 */
contract DeploySquadRevenueSplit is Script {
    function run() external returns (SquadRevenueSplit split) {
        // ─── Read env vars ────────────────────────────────────────────────────

        address usdc         = vm.envAddress("USDC_ADDRESS");
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");

        // Parse comma-separated recipients
        string memory recipientsRaw = vm.envString("RECIPIENTS");
        string memory sharesRaw     = vm.envString("SHARES");

        // Parse into arrays
        address[] memory recipients = _parseAddresses(recipientsRaw);
        uint256[] memory shares     = _parseUints(sharesRaw);

        // ─── Validation ───────────────────────────────────────────────────────

        require(usdc          != address(0), "USDC_ADDRESS required");
        require(agentRegistry != address(0), "AGENT_REGISTRY required");
        require(recipients.length > 0,       "RECIPIENTS required");
        require(recipients.length == shares.length, "RECIPIENTS and SHARES must match");

        uint256 totalShares;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShares += shares[i];
        }
        require(totalShares == 10_000, "SHARES must sum to 10000 basis points");

        // ─── Log inputs ───────────────────────────────────────────────────────

        console.log("Deploying SquadRevenueSplit");
        console.log("  USDC:          ", usdc);
        console.log("  AgentRegistry: ", agentRegistry);
        console.log("  Recipients:    ", recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            console.log("    recipient %d: %s (%d bps)", i, recipients[i], shares[i]);
        }

        // ─── Deploy ───────────────────────────────────────────────────────────

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        split = new SquadRevenueSplit(recipients, shares, usdc, agentRegistry);

        vm.stopBroadcast();

        // ─── Log output ───────────────────────────────────────────────────────

        console.log("\nDeployment complete:");
        console.log("  SquadRevenueSplit: ", address(split));
        console.log("\nNext step: register your artifact in IntelligenceRegistry with:");
        console.log("  --revenue-split", address(split));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _parseAddresses(string memory csv) internal pure returns (address[] memory) {
        // Count commas
        bytes memory b = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }
        address[] memory result = new address[](count);
        uint256 idx = 0;
        uint256 start = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory part = new bytes(i - start);
                for (uint256 j = 0; j < part.length; j++) {
                    part[j] = b[start + j];
                }
                result[idx++] = _toAddress(string(part));
                start = i + 1;
            }
        }
        return result;
    }

    function _parseUints(string memory csv) internal pure returns (uint256[] memory) {
        bytes memory b = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        uint256 start = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                uint256 val = 0;
                for (uint256 j = start; j < i; j++) {
                    require(b[j] >= "0" && b[j] <= "9", "Invalid digit in SHARES");
                    val = val * 10 + (uint256(uint8(b[j])) - 48);
                }
                result[idx++] = val;
                start = i + 1;
            }
        }
        return result;
    }

    function _toAddress(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        // Trim whitespace
        uint256 start = 0;
        uint256 end = b.length;
        while (start < end && (b[start] == " " || b[start] == "\t")) start++;
        while (end > start && (b[end-1] == " " || b[end-1] == "\t")) end--;
        require(end - start == 42, "Address must be 42 chars (0x...)");
        require(b[start] == "0" && b[start+1] == "x", "Address must start with 0x");
        uint160 result = 0;
        for (uint256 i = start + 2; i < end; i++) {
            uint8 c = uint8(b[i]);
            uint8 nibble;
            if (c >= 48 && c <= 57)       nibble = c - 48;
            else if (c >= 65 && c <= 70)  nibble = c - 55;
            else if (c >= 97 && c <= 102) nibble = c - 87;
            else revert("Invalid hex char in address");
            result = result * 16 + nibble;
        }
        return address(result);
    }
}

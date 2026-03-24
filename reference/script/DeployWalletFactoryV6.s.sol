// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../contracts/WalletFactoryV6.sol";

/**
 * @title DeployWalletFactoryV6
 * @notice Deploys WalletFactoryV6 — direct-deploy factory for ARC402Wallet v6.
 *
 * V6 wallet bytecode (20,465 bytes) is under the EIP-170 limit — no code-oracle
 * pattern needed. The factory deploys wallets directly via `new ARC402Wallet(...)`.
 *
 * Hardcoded constants:
 *   ARC402RegistryV2: 0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622
 *     Wallets are registered on V2 and migrate to V3 via proposeRegistryUpdate.
 *   EntryPoint v0.7:  0x0000000071727De22E5E9d8BAf0edAc6f37da032 (Base mainnet canonical)
 *
 * After deploy:
 *   1. Authorize WalletFactoryV6 as a TrustRegistryV3 updater:
 *      cast send <TrustRegistryV3> "addUpdater(address)" <WalletFactoryV6>
 *   2. Update ENGINEERING-STATE.md with the new factory address.
 *   3. Update the CLI / SDK wallet-creation flow to use this factory.
 *
 * Usage:
 *   FOUNDRY_PROFILE=deploy forge script reference/script/DeployWalletFactoryV6.s.sol \
 *     --rpc-url $BASE_MAINNET_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY
 */
contract DeployWalletFactoryV6 is Script {
    /// @dev Wallets start on V2; owners migrate to V3 via proposeRegistryUpdate.
    address constant REGISTRY_V2  = 0xcc0D8731ccCf6CFfF4e66F6d68cA86330Ea8B622;
    /// @dev ERC-4337 EntryPoint v0.7 — canonical on Base mainnet.
    address constant ENTRY_POINT  = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external {
        console2.log("=== DeployWalletFactoryV6 ===");
        console2.log("Chain ID:         ", block.chainid);
        console2.log("ARC402RegistryV2: ", REGISTRY_V2);
        console2.log("EntryPoint v0.7:  ", ENTRY_POINT);

        vm.startBroadcast();
        WalletFactoryV6 factory = new WalletFactoryV6(REGISTRY_V2, ENTRY_POINT);
        vm.stopBroadcast();

        console2.log("");
        console2.log("WalletFactoryV6:  ", address(factory));
        console2.log("Registry:         ", factory.registry());
        console2.log("EntryPoint:       ", factory.entryPoint());
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Authorize as TrustRegistryV3 updater:");
        console2.log("     cast send <TrustRegistryV3> \"addUpdater(address)\" ", address(factory));
        console2.log("  2. Update ENGINEERING-STATE.md with WalletFactoryV6:", address(factory));
        console2.log("  3. Update CLI/SDK to use new factory address");
    }
}

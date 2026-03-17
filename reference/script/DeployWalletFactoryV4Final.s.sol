// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/WalletFactoryV3.sol";

/**
 * @title DeployWalletFactoryV4Final
 * @notice Fallback deploy script for WalletFactory v4 using the SSTORE2 split-chunk pattern.
 *         Use this if the code-oracle approach (DeployWalletFactoryV4.s.sol) fails due to
 *         ARC402Wallet creation code exceeding the oracle's EIP-170 runtime limit.
 *
 * This script deploys WalletFactoryV3 (the battle-tested two-chunk factory) with the
 * current ARC402Wallet bytecode, which includes passkey P256 support (Spec-33).
 * The resulting factory is functionally identical to a dedicated v4 factory.
 *
 * Three transactions are broadcast:
 *   1. chunk1 — runtime = first 24000 bytes of ARC402Wallet creation code
 *   2. chunk2 — runtime = remaining bytes of ARC402Wallet creation code
 *   3. WalletFactoryV3(registry, chunk1, chunk2)
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY   — deployer private key
 *   ARC402_REGISTRY_V2     — ARC402RegistryV2 address on the target chain
 */
contract DeployWalletFactoryV4Final is Script {

    uint256 constant CHUNK_SIZE = 24000;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registry    = vm.envAddress("ARC402_REGISTRY_V2");

        console.log("Deployer:         ", vm.addr(deployerKey));
        console.log("ARC402RegistryV2: ", registry);

        bytes memory walletCode = vm.getCode("ARC402Wallet.sol:ARC402Wallet");
        console.log("Wallet code len:  ", walletCode.length);
        require(walletCode.length > CHUNK_SIZE, "chunk split: code fits in one chunk, use DeployWalletFactoryV4");

        vm.startBroadcast(deployerKey);
        (address chunk1, address chunk2, address factory) = _deploy(registry, walletCode);
        vm.stopBroadcast();

        console.log("");
        console.log("=== WalletFactory v4 (Final/split-chunk) DEPLOYED (passkey P256 support) ===");
        console.log("WalletFactoryV3:  ", factory);
        console.log("chunk1:           ", chunk1);
        console.log("chunk2:           ", chunk2);
        console.log("Registry:         ", WalletFactoryV3(factory).registry());
        console.log("EntryPoint:       ", WalletFactoryV3(factory).DEFAULT_ENTRY_POINT());
    }

    function _deploy(address registry, bytes memory walletCode)
        internal returns (address chunk1, address chunk2, address factory)
    {
        // Split creation code into two chunks
        uint256 len1 = CHUNK_SIZE;
        uint256 len2 = walletCode.length - len1;

        bytes memory code1 = new bytes(len1);
        bytes memory code2 = new bytes(len2);

        for (uint256 i = 0; i < len1; i++) code1[i] = walletCode[i];
        for (uint256 i = 0; i < len2; i++) code2[i] = walletCode[len1 + i];

        chunk1  = _deployCodeOracle(code1);
        chunk2  = _deployCodeOracle(code2);
        factory = address(new WalletFactoryV3(registry, chunk1, chunk2));

        console.log("chunk1:           ", chunk1);
        console.log("chunk2:           ", chunk2);
        console.log("WalletFactoryV3:  ", factory);
    }

    /**
     * @dev Deploy a contract whose RUNTIME CODE equals `creationCode`.
     *      Init code (12 bytes): PUSH2 len  DUP1  PUSH1 12  PUSH1 0  CODECOPY  PUSH1 0  RETURN
     *      followed by the creation code payload.
     */
    function _deployCodeOracle(bytes memory creationCode) internal returns (address oracle) {
        uint256 codeLen = creationCode.length;
        require(codeLen > 0 && codeLen < 65536, "oracle: bad len");

        bytes memory prefix = new bytes(12);
        prefix[0]  = 0x61;                       // PUSH2
        prefix[1]  = bytes1(uint8(codeLen >> 8)); // len high
        prefix[2]  = bytes1(uint8(codeLen));      // len low
        prefix[3]  = 0x80;                        // DUP1
        prefix[4]  = 0x60;                        // PUSH1
        prefix[5]  = 0x0c;                        // 12 (payload offset)
        prefix[6]  = 0x60;                        // PUSH1
        prefix[7]  = 0x00;                        // 0 (mem dest)
        prefix[8]  = 0x39;                        // CODECOPY
        prefix[9]  = 0x60;                        // PUSH1
        prefix[10] = 0x00;                        // 0
        prefix[11] = 0xf3;                        // RETURN

        bytes memory initCode = abi.encodePacked(prefix, creationCode);
        assembly { oracle := create(0, add(initCode, 0x20), mload(initCode)) }
        require(oracle != address(0), "oracle: deploy failed");
    }
}

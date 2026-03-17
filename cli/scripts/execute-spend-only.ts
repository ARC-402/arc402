/**
 * execute-spend-only.ts
 * Send ONLY the executeSpend tx — context and attest already confirmed on-chain.
 * Uses the attestation ID from the last successful attest tx.
 */

import { ethers } from "ethers";
import { loadConfig } from "../src/config";
import { connectPhoneWallet, sendTransactionWithSession } from "../src/walletconnect";

const DEPLOYER = "0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB";
const WALLET   = "0xC3207bFe22cba39AeC4e8540c97c29B028103c7F";
const RPC      = "https://base-mainnet.g.alchemy.com/v2/YIA2uRCsFI-j5pqH-aRzflrACSlV1Qrs";
const CHAIN_ID = 8453;

// Attest tx was: 0x28dbff33aa65b0617c4f25810f06f76bfcf0a430f461b...
// Recover attestId from the drain script's timestamp-based keccak
// The attest tx confirmed — we need to recover the attestId used.
// Re-derive it: the script used `attest-${Date.now()}` at time of that run.
// Instead, read it from the IntentAttestation contract by checking events.

const INTENT_ATTEST_ABI = [
  "event AttestationCreated(bytes32 indexed attestationId, address indexed wallet, address recipient, uint256 amount, address token)",
  "function verify(bytes32 attestationId, address wallet, address recipient, uint256 amount, address token) external view returns (bool)",
];

const WALLET_ABI = [
  "function executeSpend(address payable recipient, uint256 amount, string calldata category, bytes32 attestationId) external",
];

const INTENT_ATTEST_ADDR = "0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460";

async function main() {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(RPC);

  // Find the most recent AttestationCreated event for this wallet → DEPLOYER
  const attestContract = new ethers.Contract(INTENT_ATTEST_ADDR, INTENT_ATTEST_ABI, provider);
  const block = await provider.getBlockNumber();
  // Hardcoded from confirmed attest tx 0x28dbff33...c17
  const attestId = "0x9d8bdb5f551f63e986e5d0c980fd68f4e445b9f7902f71226ec08ce24bceebb0";
  const amount   = ethers.parseEther("0.00015");

  console.log(`Found attestation: ${attestId}`);
  console.log(`Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`Sending executeSpend → ${DEPLOYER}\n`);

  const iface = new ethers.Interface(WALLET_ABI);
  const txSpend = {
    to: WALLET,
    data: iface.encodeFunctionData("executeSpend", [DEPLOYER, amount, "drain", attestId]),
    value: "0x0",
  };

  const tgOpts = {
    botToken: config.telegramBotToken!,
    chatId:   config.telegramChatId!,
    threadId: config.telegramThreadId,
  };

  const { client, session, account } = await connectPhoneWallet(
    config.walletConnectProjectId!,
    CHAIN_ID,
    config,
    {
      telegramOpts: tgOpts,
      prompt: `⛓ BASE ONLY — Final tx: executeSpend ${ethers.formatEther(amount)} ETH → deployer\n\n⚠️ Keep MetaMask on Base and approve`,
    }
  );

  console.log(`Connected: ${account}`);
  console.log("Sending executeSpend...");
  const hash = await sendTransactionWithSession(client, session, account, CHAIN_ID, txSpend);
  console.log(`\n✅ Done: ${hash}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});

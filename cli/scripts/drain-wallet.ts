/**
 * drain-wallet.ts
 * Drain all ETH from the ARC402Wallet contract to the deployer wallet.
 * Uses WalletConnect — sends MetaMask approval button to Telegram.
 *
 * Flow:
 *   1. Read wallet balance
 *   2. Build openContext + attest + executeSpend calldata
 *   3. Connect via WalletConnect (sends Telegram button)
 *   4. Send all 3 txs sequentially for owner approval
 */

import { ethers } from "ethers";
import { loadConfig } from "../src/config";
import { connectPhoneWallet, sendTransactionWithSession } from "../src/walletconnect";

const DEPLOYER = "0x59A32A792d0f25B0E0a4A4aFbFDf514b94B102fB";
const WALLET   = "0xC3207bFe22cba39AeC4e8540c97c29B028103c7F";
const RPC      = "https://base-mainnet.g.alchemy.com/v2/YIA2uRCsFI-j5pqH-aRzflrACSlV1Qrs";
const CHAIN_ID = 8453;

const WALLET_ABI = [
  "function openContext(bytes32 contextId, string calldata taskType) external",
  "function closeContext() external",
  "function attest(bytes32 attestationId, string calldata action, string calldata reason, address recipient, uint256 amount, address token, uint256 expiresAt) external returns (bytes32)",
  "function executeSpend(address payable recipient, uint256 amount, string calldata category, bytes32 attestationId) external",
  "function contextOpen() external view returns (bool)",
];

async function main() {
  const config = loadConfig();

  const balance = await new ethers.JsonRpcProvider(RPC).getBalance(WALLET);

  if (balance === 0n) {
    console.log("Wallet is already empty.");
    process.exit(0);
  }

  // Reserve gas for 3 transactions (~300k gas @ ~0.01 gwei = ~0.003 ETH buffer)
  const gasReserve = ethers.parseEther("0.0001");
  const sendAmount = balance - gasReserve;

  if (sendAmount <= 0n) {
    console.log(`Balance too low to drain safely: ${ethers.formatEther(balance)} ETH`);
    process.exit(0);
  }

  console.log(`\nDraining ${ethers.formatEther(sendAmount)} ETH from wallet contract`);
  console.log(`  From: ${WALLET}`);
  console.log(`  To:   ${DEPLOYER}\n`);

  const iface = new ethers.Interface(WALLET_ABI);

  const contextId    = ethers.keccak256(ethers.toUtf8Bytes(`drain-${Date.now()}`));
  const attestId     = ethers.keccak256(ethers.toUtf8Bytes(`attest-${Date.now()}`));
  const expiresAt    = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  // Close any existing open context first (from prior partial run)
  const provider = new ethers.JsonRpcProvider(RPC);
  const contextOpenRaw = await provider.call({ to: WALLET, data: iface.encodeFunctionData("contextOpen") });
  const contextAlreadyOpen = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], contextOpenRaw)[0];

  const txCloseContext = contextAlreadyOpen ? {
    to: WALLET,
    data: iface.encodeFunctionData("closeContext"),
    value: "0x0",
  } : null;

  const txOpenContext = {
    to: WALLET,
    data: iface.encodeFunctionData("openContext", [contextId, "drain"]),
    value: "0x0",
  };

  const txAttest = {
    to: WALLET,
    data: iface.encodeFunctionData("attest", [
      attestId,
      "drain",
      "drain to deployer",
      DEPLOYER,
      sendAmount,
      ethers.ZeroAddress,
      expiresAt,
    ]),
    value: "0x0",
  };

  const txSpend = {
    to: WALLET,
    data: iface.encodeFunctionData("executeSpend", [
      DEPLOYER,
      sendAmount,
      "drain",
      attestId,
    ]),
    value: "0x0",
  };

  const tgOpts = {
    botToken: config.telegramBotToken!,
    chatId:   config.telegramChatId!,
    threadId: config.telegramThreadId,
  };

  console.log("Connecting WalletConnect — fresh session, Base network enforced...\n");

  const { client, session, account } = await connectPhoneWallet(
    config.walletConnectProjectId!,
    CHAIN_ID,
    config,
    {
      telegramOpts: tgOpts,
      prompt: `⛓ BASE NETWORK ONLY\nApprove drain of ${ethers.formatEther(sendAmount)} ETH → deployer wallet\n\n⚠️ Make sure MetaMask is on BASE before approving`,
    }
  );

  console.log(`\nConnected: ${account}`);

  let txCount = 1;
  const total = (txCloseContext ? 4 : 3);

  if (txCloseContext) {
    console.log(`Sending tx ${txCount++}/${total}: closeContext (cleaning up prior run)...`);
    const hClose = await sendTransactionWithSession(client, session, account, CHAIN_ID, txCloseContext);
    console.log(`  ✓ ${hClose}`);
  }

  console.log(`Sending tx ${txCount++}/${total}: openContext...`);
  const h1 = await sendTransactionWithSession(client, session, account, CHAIN_ID, txOpenContext);
  console.log(`  ✓ ${h1}`);

  console.log(`Sending tx ${txCount++}/${total}: attest...`);
  const h2 = await sendTransactionWithSession(client, session, account, CHAIN_ID, txAttest);
  console.log(`  ✓ ${h2}`);

  console.log(`Sending tx ${txCount++}/${total}: executeSpend...`);
  const h3 = await sendTransactionWithSession(client, session, account, CHAIN_ID, txSpend);
  console.log(`  ✓ ${h3}`);

  console.log(`\n✅ Done. ${ethers.formatEther(sendAmount)} ETH sent to deployer.`);
  process.exit(0);
}

main().catch(e => {
  console.error(e.message ?? e);
  process.exit(1);
});

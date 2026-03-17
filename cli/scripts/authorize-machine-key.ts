import { ethers } from "ethers";
import { loadConfig } from "../src/config";
import { connectPhoneWallet, sendTransactionWithSession } from "../src/walletconnect";

const WALLET   = "0xC3207bFe22cba39AeC4e8540c97c29B028103c7F";
const HOT_KEY  = "0x747024C2e59C523E3B1621A4b3F92366C1E28A30";
const CHAIN_ID = 8453;

async function main() {
  const config = loadConfig();
  const iface  = new ethers.Interface(["function authorizeMachineKey(address key) external"]);

  const tx = {
    to:    WALLET,
    data:  iface.encodeFunctionData("authorizeMachineKey", [HOT_KEY]),
    value: "0x0",
  };

  const tgOpts = {
    botToken: config.telegramBotToken!,
    chatId:   config.telegramChatId!,
    threadId: config.telegramThreadId,
  };

  console.log(`Authorizing hot key ${HOT_KEY} as machine key on ${WALLET}\n`);

  const { client, session, account } = await connectPhoneWallet(
    config.walletConnectProjectId!,
    CHAIN_ID,
    config,
    {
      telegramOpts: tgOpts,
      prompt: "⛓ BASE — authorizeMachineKey (one-time). After this the hot key runs autonomously.",
    }
  );

  console.log("Connected:", account);
  const hash = await sendTransactionWithSession(client, session, account, CHAIN_ID, tx);
  console.log("✅ Done:", hash);
  process.exit(0);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });

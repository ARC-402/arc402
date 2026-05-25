import prompts from "prompts";
import { Arc402Config, getWcProjectId, loadConfig, saveConfig } from "../config";
import { sendTelegramMessage, sendWalletConnectApprovalButton } from "../telegram-notify";
import { getApprovalConfig, setApprovalConfig } from "./config";
import { ApprovalTransportName } from "./types";

export async function runApprovalInit(): Promise<Arc402Config | null> {
  const config = loadConfig();
  const current = getApprovalConfig(config);

  const answers = await prompts([
        {
          type: "select",
          name: "defaultTransport",
          message: "Default phone approval transport",
          choices: [
            { title: "Telegram + WalletConnect (recommended)", value: "telegram_walletconnect" },
            { title: "Telegram + passkey link", value: "telegram_passkey_link" },
            { title: "Local QR only", value: "local_qr" },
          ],
      initial: current.defaultTransport === "telegram_passkey_link" ? 1 : current.defaultTransport === "local_qr" ? 2 : 0,
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_walletconnect" ? "text" : null,
      name: "walletConnectProjectId",
      message: "WalletConnect project id",
      initial: current.walletConnectProjectId ?? getWcProjectId(),
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_walletconnect" || prev === "telegram_passkey_link" ? "password" : null,
      name: "botToken",
      message: "Telegram bot token",
      initial: current.telegram?.botToken,
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_walletconnect" || prev === "telegram_passkey_link" ? "text" : null,
      name: "chatId",
      message: "Telegram chat id",
      initial: current.telegram?.chatId,
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_walletconnect" || prev === "telegram_passkey_link" ? "number" : null,
      name: "threadId",
      message: "Telegram thread id (optional)",
      initial: current.telegram?.threadId,
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_passkey_link" ? "text" : null,
      name: "passkeyBaseUrl",
      message: "Passkey approval base URL",
      initial: current.passkey?.baseUrl,
    },
    {
      type: (prev: ApprovalTransportName) => prev === "telegram_passkey_link" ? "text" : null,
      name: "passkeyRpId",
      message: "Passkey RP ID",
      initial: current.passkey?.rpId,
    },
    {
      type: "confirm",
      name: "requireTestOnInit",
      message: "Send a live test message before finishing setup?",
      initial: current.requireTestOnInit,
    },
  ]);

  if (!answers.defaultTransport) return null;

  setApprovalConfig(config, {
    defaultTransport: answers.defaultTransport,
    fallbackTransport: "local_qr",
    requireTestOnInit: Boolean(answers.requireTestOnInit),
    walletConnectProjectId: answers.walletConnectProjectId ?? current.walletConnectProjectId,
    telegram: {
      botToken: answers.botToken ?? current.telegram?.botToken,
      chatId: answers.chatId ?? current.telegram?.chatId,
      threadId: typeof answers.threadId === "number" ? answers.threadId : current.telegram?.threadId,
    },
    passkey: {
      baseUrl: answers.passkeyBaseUrl ?? current.passkey?.baseUrl,
      rpId: answers.passkeyRpId ?? current.passkey?.rpId,
    },
  });

  saveConfig(config);
  return config;
}

export async function sendApprovalTest(config: Arc402Config): Promise<void> {
  const approval = getApprovalConfig(config);
  if (approval.defaultTransport === "telegram_walletconnect") {
    if (!approval.telegram?.botToken || !approval.telegram?.chatId) {
      throw new Error("Telegram approval config incomplete.");
    }
    const projectId = approval.walletConnectProjectId ?? getWcProjectId();
    await sendTelegramMessage({
      botToken: approval.telegram.botToken,
      chatId: approval.telegram.chatId,
      threadId: approval.telegram.threadId,
      text: `ARC-402 approval transport is configured. WalletConnect project: ${projectId.slice(0, 8)}…`,
    });
    await sendWalletConnectApprovalButton({
      botToken: approval.telegram.botToken,
      chatId: approval.telegram.chatId,
      threadId: approval.telegram.threadId,
      prompt: "ARC-402 approval test — deep links should open your wallet app on phone.",
      walletLinks: [
        { label: "🦊 MetaMask", url: "https://metamask.app.link/" },
        { label: "🌈 Rainbow", url: "https://rnbwapp.com/" },
        { label: "🔵 Trust Wallet", url: "https://trustwallet.com/browser-extension" },
      ],
    });
  } else if (approval.defaultTransport === "telegram_passkey_link") {
    if (!approval.telegram?.botToken || !approval.telegram?.chatId || !approval.passkey?.baseUrl) {
      throw new Error("Passkey-link approval config incomplete.");
    }
    await sendTelegramMessage({
      botToken: approval.telegram.botToken,
      chatId: approval.telegram.chatId,
      threadId: approval.telegram.threadId,
      text: "ARC-402 passkey-link transport is configured.",
      buttons: [[{ text: "🔐 Test Face ID link", url: `${approval.passkey.baseUrl}?mode=test` }]],
    });
  }
}

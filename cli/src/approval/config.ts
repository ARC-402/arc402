import { Arc402Config, getWcProjectId } from "../config";
import { ApprovalTransportName } from "./types";

export interface NormalizedApprovalConfig {
  defaultTransport: ApprovalTransportName;
  fallbackTransport?: ApprovalTransportName;
  requireTestOnInit: boolean;
  walletConnectProjectId?: string;
  telegram?: {
    botToken?: string;
    chatId?: string;
    threadId?: number;
  };
  passkey?: {
    baseUrl?: string;
    rpId?: string;
  };
}

export function getApprovalConfig(config: Arc402Config): NormalizedApprovalConfig {
  return {
    defaultTransport: config.approval?.defaultTransport ?? "telegram_walletconnect",
    fallbackTransport: config.approval?.fallbackTransport ?? "local_qr",
    requireTestOnInit: config.approval?.requireTestOnInit ?? true,
    walletConnectProjectId: config.approval?.walletConnectProjectId ?? config.walletConnectProjectId ?? getWcProjectId(),
    telegram: {
      botToken: config.approval?.telegram?.botToken ?? config.telegramBotToken,
      chatId: config.approval?.telegram?.chatId ?? config.telegramChatId,
      threadId: config.approval?.telegram?.threadId ?? config.telegramThreadId,
    },
    passkey: {
      baseUrl: config.approval?.passkey?.baseUrl ?? "https://app.arc402.xyz/passkey-sign",
      rpId: config.approval?.passkey?.rpId ?? "app.arc402.xyz",
    },
  };
}

export function setApprovalConfig(config: Arc402Config, approval: NormalizedApprovalConfig): Arc402Config {
  config.approval = {
    defaultTransport: approval.defaultTransport,
    fallbackTransport: approval.fallbackTransport === "desktop_wallet" ? "desktop_wallet" : "local_qr",
    requireTestOnInit: approval.requireTestOnInit,
    walletConnectProjectId: approval.walletConnectProjectId,
    telegram: approval.telegram,
    passkey: approval.passkey,
  };

  if (approval.walletConnectProjectId) config.walletConnectProjectId = approval.walletConnectProjectId;
  if (approval.telegram?.botToken) config.telegramBotToken = approval.telegram.botToken;
  if (approval.telegram?.chatId) config.telegramChatId = approval.telegram.chatId;
  if (approval.telegram?.threadId !== undefined) config.telegramThreadId = approval.telegram.threadId;

  return config;
}

import { Arc402Config } from "../../config";
import { connectPhoneWallet } from "../../walletconnect";
import { getApprovalConfig } from "../config";
import { ApprovalIntent, ApprovalResult, ApprovalTransport } from "../types";

export const telegramWalletConnectTransport: ApprovalTransport = {
  name: "telegram_walletconnect",
  supports(intent: ApprovalIntent, config: Arc402Config): boolean {
    const approval = getApprovalConfig(config);
    return (
      intent.signerMode === "owner_wallet" &&
      Boolean(approval.walletConnectProjectId) &&
      Boolean(approval.telegram?.botToken) &&
      Boolean(approval.telegram?.chatId)
    );
  },
  async request(intent: ApprovalIntent, config: Arc402Config): Promise<ApprovalResult> {
    const approval = getApprovalConfig(config);
    if (!approval.walletConnectProjectId) {
      return { status: "rejected", transport: "telegram_walletconnect", signerMode: intent.signerMode, error: "walletConnectProjectId missing" };
    }
    if (!approval.telegram?.botToken || !approval.telegram?.chatId) {
      return { status: "rejected", transport: "telegram_walletconnect", signerMode: intent.signerMode, error: "Telegram approval config missing" };
    }

    const session = await connectPhoneWallet(approval.walletConnectProjectId, intent.chainId, config, {
      telegramOpts: {
        botToken: approval.telegram.botToken,
        chatId: approval.telegram.chatId,
        threadId: approval.telegram.threadId,
      },
      prompt: intent.ui.summary,
      hardware: intent.metadata?.hardware,
    });

    return {
      status: "approved",
      transport: "telegram_walletconnect",
      signerMode: intent.signerMode,
      session: {
        kind: "walletconnect",
        client: session.client,
        session: session.session,
        account: session.account,
      },
    };
  },
  async status(config: Arc402Config): Promise<{ ok: boolean; detail?: string }> {
    const approval = getApprovalConfig(config);
    const ok = Boolean(approval.walletConnectProjectId && approval.telegram?.botToken && approval.telegram?.chatId);
    return {
      ok,
      detail: ok ? "Telegram + WalletConnect configured" : "Missing WalletConnect project id or Telegram bot/chat config",
    };
  },
};

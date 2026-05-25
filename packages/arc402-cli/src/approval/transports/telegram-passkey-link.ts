import { Arc402Config } from "../../config";
import { sendTelegramMessage } from "../../telegram-notify";
import { getApprovalConfig } from "../config";
import { createPasskeyApprovalRequest, waitForPasskeyApprovalRequest } from "../passkey-requests";
import { ApprovalIntent, ApprovalResult, ApprovalTransport } from "../types";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function resolvePasskeyCallbackUrl(config: Arc402Config): string | undefined {
  if (config.endpoint?.trim()) {
    return `${trimTrailingSlash(config.endpoint.trim())}/approvals/passkey/callback`;
  }
  if (config.chat?.daemonUrl?.trim()) {
    return `${trimTrailingSlash(config.chat.daemonUrl.trim())}/approvals/passkey/callback`;
  }
  return undefined;
}

function buildPasskeyApprovalUrl(baseUrl: string, intent: ApprovalIntent, request: ReturnType<typeof createPasskeyApprovalRequest>): string {
  const params = new URLSearchParams({
    action: intent.actionType,
    chainId: String(intent.chainId),
    approvalId: request.approvalId,
    challenge: request.challenge,
    expiresAt: request.expiresAt,
    title: intent.ui.title,
    op: intent.ui.title,
    summary: intent.ui.summary,
  });
  if (intent.walletAddress) params.set("wallet", intent.walletAddress);
  return `${baseUrl}?${params.toString()}`;
}

export const telegramPasskeyLinkTransport: ApprovalTransport = {
  name: "telegram_passkey_link",
  supports(intent: ApprovalIntent, config: Arc402Config): boolean {
    const approval = getApprovalConfig(config);
    return Boolean(approval.telegram?.botToken && approval.telegram?.chatId && approval.passkey?.baseUrl) &&
      (intent.signerMode === "passkey" || intent.actionType === "custom_tx");
  },
  async request(intent: ApprovalIntent, config: Arc402Config): Promise<ApprovalResult> {
    const approval = getApprovalConfig(config);
    if (!approval.telegram?.botToken || !approval.telegram?.chatId || !approval.passkey?.baseUrl) {
      return {
        status: "rejected",
        transport: "telegram_passkey_link",
        signerMode: intent.signerMode,
        error: "Passkey link transport not fully configured",
      };
    }

    const request = createPasskeyApprovalRequest(intent);
    const url = buildPasskeyApprovalUrl(approval.passkey.baseUrl, intent, request);
    const callbackUrl = resolvePasskeyCallbackUrl(config);
    const finalUrl = callbackUrl ? `${url}&callback=${encodeURIComponent(callbackUrl)}` : url;
    await sendTelegramMessage({
      botToken: approval.telegram.botToken,
      chatId: approval.telegram.chatId,
      threadId: approval.telegram.threadId,
      text: `${intent.ui.summary}\n\nApproval ID: ${request.approvalId}`,
      buttons: [[{ text: "🔐 Approve with Face ID", url: finalUrl }]],
    });

    if (!callbackUrl) {
      return {
        status: "pending",
        transport: "telegram_passkey_link",
        signerMode: intent.signerMode,
        approvalId: request.approvalId,
        approvalUrl: finalUrl,
        expiresAt: request.expiresAt,
        error: "Passkey approval link sent, but no callback URL could be derived from endpoint/chat daemon config.",
      };
    }

    const settled = await waitForPasskeyApprovalRequest(
      request.approvalId,
      Math.max(Date.parse(request.expiresAt) - Date.now(), 0),
    );

    if (!settled) {
      return {
        status: "expired",
        transport: "telegram_passkey_link",
        signerMode: intent.signerMode,
        approvalId: request.approvalId,
        approvalUrl: finalUrl,
        expiresAt: request.expiresAt,
        error: "Passkey approval request disappeared before settlement.",
      };
    }

    if (settled.status === "approved" && settled.signature && settled.credentialId) {
      return {
        status: "approved",
        transport: "telegram_passkey_link",
        signerMode: intent.signerMode,
        approvalId: settled.approvalId,
        approvalUrl: finalUrl,
        expiresAt: settled.expiresAt,
        passkeyApproval: {
          signature: settled.signature,
          credentialId: settled.credentialId,
          wallet: settled.wallet,
          operation: settled.operation,
          approvedAt: settled.approvedAt,
        },
      };
    }

    return {
      status: settled.status,
      transport: "telegram_passkey_link",
      signerMode: intent.signerMode,
      approvalId: settled.approvalId,
      approvalUrl: finalUrl,
      expiresAt: settled.expiresAt,
      error: settled.status === "expired"
        ? "Passkey approval request expired before completion."
        : "Passkey approval did not complete successfully.",
    };
  },
  async test(config: Arc402Config): Promise<void> {
    const approval = getApprovalConfig(config);
    if (!approval.telegram?.botToken || !approval.telegram?.chatId || !approval.passkey?.baseUrl) {
      throw new Error("Passkey link transport not fully configured.");
    }
    const url = `${approval.passkey.baseUrl}?mode=test`;
    await sendTelegramMessage({
      botToken: approval.telegram.botToken,
      chatId: approval.telegram.chatId,
      threadId: approval.telegram.threadId,
      text: "ARC-402 passkey-link approval transport test.",
      buttons: [[{ text: "🔐 Test Face ID link", url }]],
    });
  },
  async status(config: Arc402Config): Promise<{ ok: boolean; detail?: string }> {
    const approval = getApprovalConfig(config);
    const ok = Boolean(approval.telegram?.botToken && approval.telegram?.chatId && approval.passkey?.baseUrl);
    return {
      ok,
      detail: ok ? "Telegram + passkey base URL configured" : "Missing Telegram config or passkey base URL",
    };
  },
};

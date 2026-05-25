import { Arc402Config } from "../config";
import { getApprovalConfig } from "./config";
import { localQrTransport } from "./transports/local-qr";
import { telegramPasskeyLinkTransport } from "./transports/telegram-passkey-link";
import { telegramWalletConnectTransport } from "./transports/telegram-walletconnect";
import { ApprovalIntent, ApprovalResult, ApprovalTransport, ApprovalTransportName } from "./types";

const transports: Record<ApprovalTransportName, ApprovalTransport | undefined> = {
  telegram_walletconnect: telegramWalletConnectTransport,
  telegram_passkey_link: telegramPasskeyLinkTransport,
  local_qr: localQrTransport,
  desktop_wallet: undefined,
};

function resolveTransport(intent: ApprovalIntent, config: Arc402Config): ApprovalTransport {
  const approval = getApprovalConfig(config);
  const primary = transports[approval.defaultTransport];
  if (primary?.supports(intent, config)) return primary;

  if (approval.fallbackTransport) {
    const fallback = transports[approval.fallbackTransport];
    if (fallback?.supports(intent, config)) return fallback;
  }

  for (const transport of Object.values(transports)) {
    if (transport?.supports(intent, config)) return transport;
  }

  throw new Error("No compatible approval transport configured for this action.");
}

export async function requestOwnerApproval(intent: ApprovalIntent, config: Arc402Config): Promise<ApprovalResult> {
  const transport = resolveTransport(intent, config);
  return transport.request(intent, config);
}

export async function getApprovalStatus(config: Arc402Config): Promise<Array<{ name: string; ok: boolean; detail?: string }>> {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
  for (const [name, transport] of Object.entries(transports)) {
    if (!transport?.status) continue;
    const status = await transport.status(config);
    results.push({ name, ...status });
  }
  return results;
}

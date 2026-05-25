import { Arc402Config } from "../../config";
import { connectPhoneWallet } from "../../walletconnect";
import { getApprovalConfig } from "../config";
import { ApprovalIntent, ApprovalResult, ApprovalTransport } from "../types";

export const localQrTransport: ApprovalTransport = {
  name: "local_qr",
  supports(intent: ApprovalIntent, config: Arc402Config): boolean {
    const approval = getApprovalConfig(config);
    return intent.signerMode === "owner_wallet" && Boolean(approval.walletConnectProjectId);
  },
  async request(intent: ApprovalIntent, config: Arc402Config): Promise<ApprovalResult> {
    const approval = getApprovalConfig(config);
    if (!approval.walletConnectProjectId) {
      return { status: "rejected", transport: "local_qr", signerMode: intent.signerMode, error: "walletConnectProjectId missing" };
    }

    const session = await connectPhoneWallet(approval.walletConnectProjectId, intent.chainId, config, {
      prompt: intent.ui.summary,
      hardware: intent.metadata?.hardware,
    });

    return {
      status: "approved",
      transport: "local_qr",
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
    const ok = Boolean(approval.walletConnectProjectId);
    return {
      ok,
      detail: ok ? "WalletConnect configured for local QR flow" : "Missing WalletConnect project id",
    };
  },
};

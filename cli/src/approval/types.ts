import { Arc402Config } from "../config";

export type ApprovalActionType =
  | "wallet_deploy"
  | "wallet_onboard"
  | "policy_update"
  | "agent_register"
  | "hire_accept"
  | "spend_limit_set"
  | "custom_tx";

export type ApprovalSignerMode = "owner_wallet" | "passkey" | "guardian";

export type ApprovalTransportName =
  | "telegram_walletconnect"
  | "telegram_passkey_link"
  | "local_qr"
  | "desktop_wallet";

export interface ApprovalIntent {
  actionType: ApprovalActionType;
  signerMode: ApprovalSignerMode;
  chainId: number;
  walletAddress?: string;
  txs: Array<{
    to: string;
    data: string;
    value?: string;
  }>;
  ui: {
    title: string;
    summary: string;
    risk: "low" | "medium" | "high";
  };
  metadata?: {
    category?: string;
    expectedApprovalCount?: number;
    returnUrl?: string;
    sourceRuntime?: "cli" | "openclaw" | "hermes" | "web" | "other";
    hardware?: boolean;
    passkeyChallenge?: string;
  };
}

export interface ApprovalTransportSession {
  kind: "walletconnect";
  client: Awaited<ReturnType<typeof import("@walletconnect/sign-client").SignClient.init>>;
  session: ReturnType<Awaited<ReturnType<typeof import("@walletconnect/sign-client").SignClient.init>>["session"]["get"]>;
  account: string;
}

export interface ApprovalResult {
  status: "pending" | "approved" | "rejected" | "expired";
  transport: ApprovalTransportName;
  signerMode: ApprovalSignerMode;
  approvalId?: string;
  approvalUrl?: string;
  expiresAt?: string;
  passkeyApproval?: {
    signature: string;
    credentialId: string;
    wallet?: string;
    operation?: string;
    approvedAt?: string;
  };
  approvals?: Array<{
    txHash?: string;
    approvedAt?: string;
  }>;
  session?: ApprovalTransportSession;
  error?: string;
}

export interface ApprovalTransport {
  name: ApprovalTransportName;
  supports(intent: ApprovalIntent, config: Arc402Config): boolean;
  request(intent: ApprovalIntent, config: Arc402Config): Promise<ApprovalResult>;
  test?(config: Arc402Config): Promise<void>;
  status?(config: Arc402Config): Promise<{ ok: boolean; detail?: string }>;
}

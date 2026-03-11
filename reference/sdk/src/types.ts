export interface Policy {
  walletAddress: string;
  policyHash?: string;
  categories: Record<string, CategoryLimit>;
}

export interface PolicyCategory {
  name: string;
  limitPerTx: bigint;
  dailyLimit?: bigint;
}

export interface CategoryLimit {
  limitPerTx: bigint;
}

export interface EscalationConfig {
  threshold: bigint;
  approver: string;
}

export interface Context {
  contextId: string;
  taskType: string;
  openedAt: number;
  isOpen: boolean;
}

export interface TrustScore {
  score: number;
  level: "probationary" | "restricted" | "standard" | "elevated" | "autonomous";
  nextLevelAt: number;
}

export interface TrustThreshold {
  min: number;
  max: number;
  level: TrustScore["level"];
  limitMultiplier: number;
  requiresApproval: boolean;
}

export interface Intent {
  attestationId: string;
  action: string;
  reason: string;
  recipient: string;
  amount: bigint;
  wallet: string;
  timestamp: number;
}

export interface Attestation {
  attestationId: string;
  wallet: string;
  action: string;
  reason: string;
  recipient: string;
  amount: bigint;
  timestamp: number;
}

export interface SettlementProposal {
  proposalId: string;
  from: string;
  to: string;
  amount: bigint;
  intentId: string;
  expiresAt: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXECUTED" | "EXPIRED";
}

export interface AcceptanceProof {
  proposalId: string;
  acceptedBy: string;
  timestamp: number;
}

export interface RejectionProof {
  proposalId: string;
  rejectedBy: string;
  reason: RejectionCode;
  timestamp: number;
}

export type RejectionCode =
  | "POLICY_CATEGORY_BLOCKED"
  | "SENDER_TRUST_INSUFFICIENT"
  | "AMOUNT_EXCEEDS_POLICY"
  | "CONTEXT_MISMATCH"
  | "INTENT_MISSING";

export interface ContractAddresses {
  policyEngine: string;
  trustRegistry: string;
  intentAttestation: string;
  settlementCoordinator: string;
  walletFactory?: string;
}

export const NETWORKS: Record<
  string,
  { chainId: number; rpc: string; contracts: ContractAddresses }
> = {
  "base-sepolia": {
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    contracts: {
      policyEngine:          "0x6B89621c94a7105c3D8e0BD8Fb06814931CA2CB2",
      trustRegistry:         "0xdA1D377991B2E580991B0DD381CdD635dd71aC39",
      intentAttestation:     "0xbB5E1809D4a94D08Bf1143131312858143D018f1",
      settlementCoordinator: "0x7ad8db6C5f394542E8e9658F86C85cC99Cf6D460",
    },
  },
  "base": {
    chainId: 8453,
    rpc: "https://mainnet.base.org",
    contracts: {
      policyEngine:          "0x0000000000000000000000000000000000000000",
      trustRegistry:         "0x0000000000000000000000000000000000000000",
      intentAttestation:     "0x0000000000000000000000000000000000000000",
      settlementCoordinator: "0x0000000000000000000000000000000000000000",
    },
  },
};

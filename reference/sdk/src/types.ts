export interface Policy {
  walletAddress: string;
  policyHash: string;
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
  wallet?: string;
}

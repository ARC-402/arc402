import { ethers, ContractTransactionResponse } from "ethers";

// ─── ABI ──────────────────────────────────────────────────────────────────────

const COMPUTE_AGREEMENT_ABI = [
  "function proposeSession(bytes32 sessionId, address provider, uint256 ratePerHour, uint256 maxHours, bytes32 gpuSpecHash, address token) external payable",
  "function acceptSession(bytes32 sessionId) external",
  "function startSession(bytes32 sessionId) external",
  "function submitUsageReport(bytes32 sessionId, uint256 periodStart, uint256 periodEnd, uint256 computeMinutes, uint256 avgUtilization, bytes providerSignature, bytes32 metricsHash) external",
  "function endSession(bytes32 sessionId) external",
  "function disputeSession(bytes32 sessionId) external",
  "function cancelSession(bytes32 sessionId) external",
  "function resolveDispute(bytes32 sessionId, uint256 providerAmount, uint256 clientAmount) external",
  "function claimDisputeTimeout(bytes32 sessionId) external",
  "function withdraw(address token) external",
  "function getSession(bytes32 sessionId) external view returns (tuple(address client, address provider, address token, uint256 ratePerHour, uint256 maxHours, uint256 depositAmount, uint256 startedAt, uint256 endedAt, uint256 consumedMinutes, uint256 proposedAt, uint256 disputedAt, bytes32 gpuSpecHash, uint8 status))",
  "function calculateCost(bytes32 sessionId) external view returns (uint256)",
  "function getUsageReports(bytes32 sessionId) external view returns (tuple(uint256 periodStart, uint256 periodEnd, uint256 computeMinutes, uint256 avgUtilization, bytes providerSignature, bytes32 metricsHash)[])",
  "function pendingWithdrawals(address user, address token) external view returns (uint256)",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeSession {
  client: string;
  provider: string;
  token: string;
  ratePerHour: bigint;
  maxHours: bigint;
  depositAmount: bigint;
  startedAt: bigint;
  endedAt: bigint;
  consumedMinutes: bigint;
  proposedAt: bigint;
  disputedAt: bigint;
  gpuSpecHash: string;
  status: number;
}

export interface ComputeUsageReport {
  periodStart: bigint;
  periodEnd: bigint;
  computeMinutes: bigint;
  avgUtilization: bigint;
  providerSignature: string;
  metricsHash: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ComputeAgreementClient {
  private contract: ethers.Contract;

  constructor(contractAddress: string, signerOrProvider: ethers.Signer | ethers.Provider) {
    this.contract = new ethers.Contract(contractAddress, COMPUTE_AGREEMENT_ABI, signerOrProvider);
  }

  async proposeSession(
    sessionId: string,
    provider: string,
    ratePerHour: bigint,
    maxHours: bigint,
    gpuSpecHash: string,
    token: string,
    deposit: bigint,
  ): Promise<ContractTransactionResponse> {
    const isEth = token === ethers.ZeroAddress;
    return this.contract.proposeSession(
      sessionId, provider, ratePerHour, maxHours, gpuSpecHash, token,
      { value: isEth ? deposit : 0n },
    ) as Promise<ContractTransactionResponse>;
  }

  async acceptSession(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.acceptSession(sessionId) as Promise<ContractTransactionResponse>;
  }

  async startSession(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.startSession(sessionId) as Promise<ContractTransactionResponse>;
  }

  async submitUsageReport(
    sessionId: string,
    periodStart: bigint,
    periodEnd: bigint,
    computeMinutes: bigint,
    avgUtilization: bigint,
    providerSignature: string,
    metricsHash: string,
  ): Promise<ContractTransactionResponse> {
    return this.contract.submitUsageReport(
      sessionId, periodStart, periodEnd, computeMinutes, avgUtilization, providerSignature, metricsHash,
    ) as Promise<ContractTransactionResponse>;
  }

  async endSession(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.endSession(sessionId) as Promise<ContractTransactionResponse>;
  }

  async disputeSession(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.disputeSession(sessionId) as Promise<ContractTransactionResponse>;
  }

  async cancelSession(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.cancelSession(sessionId) as Promise<ContractTransactionResponse>;
  }

  async resolveDispute(
    sessionId: string,
    providerAmount: bigint,
    clientAmount: bigint,
  ): Promise<ContractTransactionResponse> {
    return this.contract.resolveDispute(sessionId, providerAmount, clientAmount) as Promise<ContractTransactionResponse>;
  }

  async claimDisputeTimeout(sessionId: string): Promise<ContractTransactionResponse> {
    return this.contract.claimDisputeTimeout(sessionId) as Promise<ContractTransactionResponse>;
  }

  async withdraw(token: string): Promise<ContractTransactionResponse> {
    return this.contract.withdraw(token) as Promise<ContractTransactionResponse>;
  }

  async getSession(sessionId: string): Promise<ComputeSession> {
    return this.contract.getSession(sessionId) as Promise<ComputeSession>;
  }

  async calculateCost(sessionId: string): Promise<bigint> {
    return this.contract.calculateCost(sessionId) as Promise<bigint>;
  }

  async getUsageReports(sessionId: string): Promise<ComputeUsageReport[]> {
    return this.contract.getUsageReports(sessionId) as Promise<ComputeUsageReport[]>;
  }

  async pendingWithdrawals(user: string, token: string): Promise<bigint> {
    return this.contract.pendingWithdrawals(user, token) as Promise<bigint>;
  }
}

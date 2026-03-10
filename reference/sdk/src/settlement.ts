import { ethers } from "ethers";
import { SettlementProposal } from "./types";

const SETTLEMENT_COORDINATOR_ABI = [
  "function propose(address fromWallet, address toWallet, uint256 amount, bytes32 intentId, uint256 expiresAt) external returns (bytes32)",
  "function accept(bytes32 proposalId) external",
  "function reject(bytes32 proposalId, string calldata reason) external",
  "function execute(bytes32 proposalId) external payable",
  "function getProposal(bytes32 proposalId) external view returns (address, address, uint256, bytes32, uint256, uint8, string)",
  "function checkExpiry(bytes32 proposalId) external",
];

const STATUS_MAP: SettlementProposal["status"][] = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXECUTED",
  "EXPIRED",
];

export class SettlementClient {
  private contract: ethers.Contract;

  constructor(address: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(address, SETTLEMENT_COORDINATOR_ABI, signer);
  }

  async propose(
    fromWallet: string,
    toWallet: string,
    amount: bigint,
    intentId: string,
    ttlSeconds: number = 3600
  ): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const tx = await this.contract.propose(fromWallet, toWallet, amount, intentId, expiresAt);
    const receipt = await tx.wait();

    // Parse proposalId from event
    const iface = new ethers.Interface([
      "event ProposalCreated(bytes32 indexed proposalId, address indexed from, address indexed to, uint256 amount)",
    ]);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "ProposalCreated") {
          return parsed.args.proposalId;
        }
      } catch {}
    }
    throw new Error("Could not parse proposalId from receipt");
  }

  async accept(proposalId: string): Promise<void> {
    const tx = await this.contract.accept(proposalId);
    await tx.wait();
  }

  async reject(proposalId: string, reason: string): Promise<void> {
    const tx = await this.contract.reject(proposalId, reason);
    await tx.wait();
  }

  async execute(proposalId: string): Promise<void> {
    const proposal = await this.getProposal(proposalId);
    const tx = await this.contract.execute(proposalId, { value: proposal.amount });
    await tx.wait();
  }

  async getProposal(proposalId: string): Promise<SettlementProposal> {
    const [fromWallet, toWallet, amount, intentId, expiresAt, statusNum, rejectionReason] =
      await this.contract.getProposal(proposalId);
    return {
      proposalId,
      from: fromWallet,
      to: toWallet,
      amount: BigInt(amount),
      intentId,
      expiresAt: Number(expiresAt),
      status: STATUS_MAP[Number(statusNum)] ?? "PENDING",
    };
  }
}

export class MultiAgentSettlement extends SettlementClient {}

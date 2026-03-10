import { ethers } from "ethers";
import { TrustScore } from "./types";

const TRUST_REGISTRY_ABI = [
  "function getScore(address wallet) external view returns (uint256)",
  "function initWallet(address wallet) external",
  "function recordSuccess(address wallet) external",
  "function recordAnomaly(address wallet) external",
  "function getTrustLevel(address wallet) external view returns (string)",
];

export class TrustClient {
  private contract: ethers.Contract;

  constructor(address: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(address, TRUST_REGISTRY_ABI, signer);
  }

  async getScore(walletAddress: string): Promise<TrustScore> {
    const score = await this.contract.getScore(walletAddress);
    const numScore = Number(score);
    return {
      score: numScore,
      level: this.getTrustLevel(numScore),
    };
  }

  getTrustLevel(score: number): TrustScore["level"] {
    if (score < 100) return "probationary";
    if (score < 300) return "restricted";
    if (score < 600) return "standard";
    if (score < 800) return "elevated";
    return "autonomous";
  }

  async init(walletAddress: string): Promise<void> {
    const tx = await this.contract.initWallet(walletAddress);
    await tx.wait();
  }
}

// Alias for backward compat with index.ts export name
export class TrustPrimitive extends TrustClient {}

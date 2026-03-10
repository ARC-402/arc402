import { ethers } from "ethers";
import { Policy } from "./types";

const POLICY_ENGINE_ABI = [
  "function setPolicy(bytes32 policyHash, bytes calldata policyData) external",
  "function getPolicy(address wallet) external view returns (bytes32, bytes)",
  "function setCategoryLimit(string calldata category, uint256 limitPerTx) external",
  "function setCategoryLimitFor(address wallet, string calldata category, uint256 limitPerTx) external",
  "function validateSpend(address wallet, string calldata category, uint256 amount, bytes32 contextId) external view returns (bool, string)",
  "function categoryLimits(address wallet, string category) external view returns (uint256)",
  "function registerWallet(address wallet, address owner) external",
];

export class PolicyClient {
  private contract: ethers.Contract;

  constructor(address: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(address, POLICY_ENGINE_ABI, signer);
  }

  async set(walletAddress: string, categories: Record<string, bigint>): Promise<void> {
    const policyData = JSON.stringify(
      Object.fromEntries(
        Object.entries(categories).map(([k, v]) => [k, v.toString()])
      )
    );
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes(policyData));
    const tx = await this.contract.setPolicy(policyHash, ethers.toUtf8Bytes(policyData));
    await tx.wait();

    for (const [category, limit] of Object.entries(categories)) {
      const tx2 = await this.contract.setCategoryLimitFor(
        walletAddress,
        category,
        limit
      );
      await tx2.wait();
    }
  }

  async get(walletAddress: string): Promise<Policy> {
    const [policyHash, policyDataBytes] = await this.contract.getPolicy(walletAddress);
    let categories: Record<string, { limitPerTx: bigint }> = {};

    if (policyDataBytes && policyDataBytes !== "0x") {
      try {
        const policyStr = ethers.toUtf8String(policyDataBytes);
        const parsed = JSON.parse(policyStr);
        for (const [k, v] of Object.entries(parsed)) {
          categories[k] = { limitPerTx: BigInt(v as string) };
        }
      } catch {
        // empty policy
      }
    }

    return {
      walletAddress,
      policyHash,
      categories,
    };
  }

  async validate(
    walletAddress: string,
    category: string,
    amount: bigint
  ): Promise<{ valid: boolean; reason?: string }> {
    const [valid, reason] = await this.contract.validateSpend(
      walletAddress,
      category,
      amount,
      ethers.ZeroHash
    );
    return { valid, reason: valid ? undefined : reason };
  }
}

export class PolicyObject extends PolicyClient {}
export class PolicyValidator {
  static validate(policy: Policy, category: string, amount: bigint): boolean {
    const limit = policy.categories[category];
    if (!limit) return false;
    return amount <= limit.limitPerTx;
  }
}

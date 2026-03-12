import { ContractRunner, ethers } from "ethers";
import { POLICY_ENGINE_ABI } from "./contracts";
import { Policy } from "./types";

export class PolicyClient {
  private contract: ethers.Contract;
  constructor(address: string, runner: ContractRunner) { this.contract = new ethers.Contract(address, POLICY_ENGINE_ABI, runner); }
  async set(walletAddress: string, categories: Record<string, bigint>) {
    const policyData = JSON.stringify(Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.toString()])));
    const tx = await this.contract.setPolicy(ethers.keccak256(ethers.toUtf8Bytes(policyData)), ethers.toUtf8Bytes(policyData));
    await tx.wait();
    for (const [category, limit] of Object.entries(categories)) {
      const updateTx = await this.contract.setCategoryLimitFor(walletAddress, category, limit);
      await updateTx.wait();
    }
  }
  async get(walletAddress: string): Promise<Policy> {
    const [policyHash, policyDataBytes] = await this.contract.getPolicy(walletAddress);
    const categories: Policy["categories"] = {};
    if (policyDataBytes && policyDataBytes !== "0x") {
      const parsed = JSON.parse(ethers.toUtf8String(policyDataBytes));
      for (const [key, value] of Object.entries(parsed)) categories[key] = { limitPerTx: BigInt(value as string) };
    }
    return { walletAddress, policyHash, categories };
  }
  async validate(walletAddress: string, category: string, amount: bigint) {
    const [valid, reason] = await this.contract.validateSpend(walletAddress, category, amount, ethers.ZeroHash);
    return { valid, reason: valid ? undefined : reason };
  }
}
export class PolicyObject extends PolicyClient {}
export class PolicyValidator { static validate(policy: Policy, category: string, amount: bigint) { return !!policy.categories[category] && amount <= policy.categories[category].limitPerTx; } }

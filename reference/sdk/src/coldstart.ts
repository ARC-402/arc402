import { BigNumberish, ContractRunner, ethers } from "ethers";

const VOUCHING_REGISTRY_ABI = [
  "function vouch(address newAgent, uint256 stakeAmount) external payable",
  "function getVouchedBoost(address agent) external view returns (uint256)",
  "function getVoucher(address agent) external view returns (address)",
] as const;

const TRUST_REGISTRY_BOND_ABI = [
  "function postBond() external payable",
  "function claimBond() external",
] as const;

export class ColdStartClient {
  private vouchingRegistryAddress: string;
  private trustRegistryAddress: string;
  private runner?: ContractRunner;

  constructor(vouchingRegistryAddress: string, trustRegistryAddress: string, runner?: ContractRunner) {
    this.vouchingRegistryAddress = vouchingRegistryAddress;
    this.trustRegistryAddress = trustRegistryAddress;
    this.runner = runner;
  }

  async vouch(newAgent: string, stakeAmount: BigNumberish, signer: ContractRunner): Promise<ethers.TransactionReceipt> {
    const contract = new ethers.Contract(this.vouchingRegistryAddress, VOUCHING_REGISTRY_ABI, signer);
    const tx = await contract.vouch(newAgent, stakeAmount);
    return tx.wait();
  }

  async postBond(signer: ContractRunner, options?: { amount?: BigNumberish }): Promise<ethers.TransactionReceipt> {
    const contract = new ethers.Contract(this.trustRegistryAddress, TRUST_REGISTRY_BOND_ABI, signer);
    const tx = await contract.postBond({ value: options?.amount ?? 0n });
    return tx.wait();
  }

  async claimBond(signer: ContractRunner): Promise<ethers.TransactionReceipt> {
    const contract = new ethers.Contract(this.trustRegistryAddress, TRUST_REGISTRY_BOND_ABI, signer);
    const tx = await contract.claimBond();
    return tx.wait();
  }

  async getVouchedBoost(address: string): Promise<bigint> {
    const contract = new ethers.Contract(this.vouchingRegistryAddress, VOUCHING_REGISTRY_ABI, this.runner);
    return BigInt(await contract.getVouchedBoost(address));
  }

  async getActiveVouch(address: string): Promise<string> {
    const contract = new ethers.Contract(this.vouchingRegistryAddress, VOUCHING_REGISTRY_ABI, this.runner);
    return contract.getVoucher(address);
  }
}

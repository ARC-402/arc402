import { ContractRunner, ethers } from "ethers";

const MIGRATION_REGISTRY_ABI = [
  "function registerMigration(address oldWallet, address newWallet) external",
  "function resolveActiveWallet(address wallet) external view returns (address)",
  "function getLineage(address wallet) external view returns (address[])",
  "function approveMigrationTarget(address implementation) external",
  "function migratedTo(address wallet) external view returns (address)",
  "function migratedFrom(address wallet) external view returns (address)",
] as const;

export class MigrationClient {
  private address: string;
  private runner?: ContractRunner;

  constructor(address: string, runner?: ContractRunner) {
    this.address = address;
    this.runner = runner;
  }

  async registerMigration(oldWallet: string, newWallet: string, signer: ContractRunner): Promise<ethers.TransactionReceipt> {
    const contract = new ethers.Contract(this.address, MIGRATION_REGISTRY_ABI, signer);
    const tx = await contract.registerMigration(oldWallet, newWallet);
    return tx.wait();
  }

  async resolveActiveWallet(wallet: string): Promise<string> {
    const contract = new ethers.Contract(this.address, MIGRATION_REGISTRY_ABI, this.runner);
    return contract.resolveActiveWallet(wallet);
  }

  async getLineage(wallet: string): Promise<string[]> {
    const contract = new ethers.Contract(this.address, MIGRATION_REGISTRY_ABI, this.runner);
    const result = await contract.getLineage(wallet);
    return [...result];
  }

  async approveMigrationTarget(impl: string, signer: ContractRunner): Promise<ethers.TransactionReceipt> {
    const contract = new ethers.Contract(this.address, MIGRATION_REGISTRY_ABI, signer);
    const tx = await contract.approveMigrationTarget(impl);
    return tx.wait();
  }
}

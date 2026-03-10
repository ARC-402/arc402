import { ethers } from "ethers";
import { Context, ContractAddresses, Intent, TrustScore } from "./types";
import { PolicyClient } from "./policy";
import { TrustClient } from "./trust";
import { IntentAttestationClient } from "./intent";

const WALLET_ABI = [
  "function openContext(bytes32 contextId, string calldata taskType) external",
  "function closeContext() external",
  "function executeSpend(address payable recipient, uint256 amount, string calldata category, bytes32 attestationId) external",
  "function proposeMASSettlement(address recipientWallet, uint256 amount, string calldata category, bytes32 attestationId) external",
  "function getTrustScore() external view returns (uint256)",
  "function getActiveContext() external view returns (bytes32, string, uint256, bool)",
  "function updatePolicy(bytes32 newPolicyId) external",
  "function contextOpen() external view returns (bool)",
];

const INTENT_ATTESTATION_ABI = [
  "function attest(bytes32 attestationId, string calldata action, string calldata reason, address recipient, uint256 amount) external",
  "function verify(bytes32 attestationId, address wallet) external view returns (bool)",
];

export class ARC402WalletClient {
  private walletContract: ethers.Contract;
  private walletAddress: string;
  private signer: ethers.Signer;
  private contracts: ContractAddresses;
  private intentContract: ethers.Contract;

  public policy: PolicyClient;
  public trust: TrustClient;
  public intent: IntentAttestationClient;

  constructor(
    walletAddress: string,
    signer: ethers.Signer,
    contracts: ContractAddresses
  ) {
    this.walletAddress = walletAddress;
    this.signer = signer;
    this.contracts = contracts;
    this.walletContract = new ethers.Contract(walletAddress, WALLET_ABI, signer);
    this.intentContract = new ethers.Contract(
      contracts.intentAttestation,
      INTENT_ATTESTATION_ABI,
      signer
    );
    this.policy = new PolicyClient(contracts.policyEngine, signer);
    this.trust = new TrustClient(contracts.trustRegistry, signer);
    this.intent = new IntentAttestationClient(
      contracts.intentAttestation,
      signer,
      walletAddress
    );
  }

  async openContext(taskType: string): Promise<string> {
    const contextId = ethers.keccak256(
      ethers.toUtf8Bytes(`${taskType}:${Date.now()}:${this.walletAddress}`)
    );
    const tx = await this.walletContract.openContext(contextId, taskType);
    await tx.wait();
    return contextId;
  }

  async closeContext(): Promise<void> {
    const tx = await this.walletContract.closeContext();
    await tx.wait();
  }

  async setPolicy(categories: Record<string, bigint>): Promise<void> {
    await this.policy.set(this.walletAddress, categories);
  }

  async executeSpend(
    recipient: string,
    amount: bigint,
    category: string,
    intentData: Omit<Intent, "attestationId">
  ): Promise<string> {
    const attestationId = ethers.keccak256(
      ethers.toUtf8Bytes(
        `${intentData.action}:${intentData.reason}:${recipient}:${amount}:${Date.now()}`
      )
    );

    const attestTx = await this.intentContract.attest(
      attestationId,
      intentData.action,
      intentData.reason,
      recipient,
      amount
    );
    await attestTx.wait();

    const tx = await this.walletContract.executeSpend(
      recipient,
      amount,
      category,
      attestationId
    );
    await tx.wait();
    return attestationId;
  }

  async getTrustScore(): Promise<TrustScore> {
    const score = await this.walletContract.getTrustScore();
    const numScore = Number(score);
    return {
      score: numScore,
      level: this.trust.getTrustLevel(numScore),
    };
  }

  async getActiveContext(): Promise<Context | null> {
    const [contextId, taskType, openedAt, isOpen] =
      await this.walletContract.getActiveContext();
    if (!isOpen) return null;
    return {
      contextId,
      taskType,
      openedAt: Number(openedAt),
      isOpen,
    };
  }
}

// Alias for backward compat with index.ts export name
export class ARC402Wallet extends ARC402WalletClient {}

export class ContextBinding {
  private walletContract: ethers.Contract;

  constructor(walletAddress: string, signer: ethers.Signer) {
    this.walletContract = new ethers.Contract(walletAddress, WALLET_ABI, signer);
  }

  async open(taskType: string): Promise<string> {
    const contextId = ethers.keccak256(
      ethers.toUtf8Bytes(`${taskType}:${Date.now()}`)
    );
    const tx = await this.walletContract.openContext(contextId, taskType);
    await tx.wait();
    return contextId;
  }

  async close(): Promise<void> {
    const tx = await this.walletContract.closeContext();
    await tx.wait();
  }
}

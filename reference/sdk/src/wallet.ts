import { ethers } from "ethers";
import { Context, ContractAddresses, Intent, TrustScore, NETWORKS } from "./types";
import { PolicyClient } from "./policy";
import { TrustClient } from "./trust";
import { IntentAttestationClient } from "./intent";

const WALLET_ABI = [
  "function openContext(bytes32 contextId, string calldata taskType) external",
  "function closeContext() external",
  "function executeSpend(address payable recipient, uint256 amount, string calldata category, bytes32 attestationId) external",
  "function getTrustScore() external view returns (uint256)",
  "function getActiveContext() external view returns (bytes32, string memory, uint256, bool)",
  "function updatePolicy(bytes32 newPolicyId) external",
  "function contextOpen() external view returns (bool)",
  "event SpendExecuted(address indexed recipient, uint256 amount, string category, bytes32 attestationId)",
  "event ContextOpened(bytes32 indexed contextId, string taskType, uint256 timestamp)",
  "event ContextClosed(bytes32 indexed contextId, uint256 timestamp)",
  "receive() external payable",
];

const WALLET_FACTORY_ABI = [
  "function createWallet() external returns (address)",
  "function getWallets(address owner) external view returns (address[])",
  "event WalletCreated(address indexed owner, address indexed walletAddress)",
];

const INTENT_ATTESTATION_ABI = [
  "function attest(bytes32 attestationId, string calldata action, string calldata reason, address recipient, uint256 amount) external",
  "function verify(bytes32 attestationId, address wallet) external view returns (bool)",
  "function getAttestation(bytes32 attestationId) external view returns (bytes32, address, string memory, string memory, address, uint256, uint256)",
  "event AttestationCreated(bytes32 indexed id, address indexed wallet, string action, string reason, address recipient, uint256 amount, uint256 timestamp)",
];

function resolveContracts(network: string): ContractAddresses {
  const net = NETWORKS[network];
  if (!net) throw new Error(`Unknown network: ${network}. Valid: ${Object.keys(NETWORKS).join(", ")}`);
  return net.contracts;
}

function getNextLevelAt(score: number): number {
  if (score < 100) return 100;
  if (score < 300) return 300;
  if (score < 600) return 600;
  if (score < 800) return 800;
  return 0; // autonomous — no next level
}

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
    network: string = "base-sepolia"
  ) {
    this.walletAddress = walletAddress;
    this.signer = signer;
    this.contracts = resolveContracts(network);
    this.walletContract = new ethers.Contract(walletAddress, WALLET_ABI, signer);
    this.intentContract = new ethers.Contract(
      this.contracts.intentAttestation,
      INTENT_ATTESTATION_ABI,
      signer
    );
    this.policy = new PolicyClient(this.contracts.policyEngine, signer);
    this.trust = new TrustClient(this.contracts.trustRegistry, signer);
    this.intent = new IntentAttestationClient(
      this.contracts.intentAttestation,
      signer,
      walletAddress
    );
  }

  /** Deploy a new ARC-402 wallet via the WalletFactory and return a client for it. */
  static async deploy(
    signer: ethers.Signer,
    network: string = "base-sepolia"
  ): Promise<ARC402WalletClient> {
    const contracts = resolveContracts(network);
    if (!contracts.walletFactory) {
      throw new Error(`WalletFactory not deployed on ${network}`);
    }
    const factory = new ethers.Contract(contracts.walletFactory, WALLET_FACTORY_ABI, signer);
    const tx = await factory.createWallet();
    const receipt = await tx.wait();

    const iface = new ethers.Interface(WALLET_FACTORY_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "WalletCreated") {
          return new ARC402WalletClient(parsed.args.walletAddress, signer, network);
        }
      } catch {}
    }
    throw new Error("Could not parse wallet address from WalletCreated event");
  }

  // ── Policy ──────────────────────────────────────────────────────────────────

  async setPolicy(categories: Record<string, bigint>): Promise<void> {
    await this.policy.set(this.walletAddress, categories);
  }

  async getPolicy() {
    return this.policy.get(this.walletAddress);
  }

  // ── Context ──────────────────────────────────────────────────────────────────

  async openContext(
    taskType: string
  ): Promise<{ contextId: string; close: () => Promise<void> }> {
    const contextId = ethers.keccak256(
      ethers.toUtf8Bytes(`${taskType}:${Date.now()}:${this.walletAddress}`)
    );
    const tx = await this.walletContract.openContext(contextId, taskType);
    await tx.wait();
    const self = this;
    return {
      contextId,
      close: () => self.closeContext(),
    };
  }

  async closeContext(): Promise<void> {
    const tx = await this.walletContract.closeContext();
    await tx.wait();
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

  // ── Spend ────────────────────────────────────────────────────────────────────

  /**
   * Create an intent attestation, then execute the spend through the wallet contract.
   * Returns the attestationId (hex string).
   */
  async spend(
    recipient: string,
    amount: bigint,
    category: string,
    action: string,
    reason: string
  ): Promise<string> {
    const attestationId = ethers.keccak256(
      ethers.toUtf8Bytes(`${action}:${reason}:${recipient}:${amount}:${Date.now()}`)
    );

    const attestTx = await this.intentContract.attest(
      attestationId,
      action,
      reason,
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

  // ── Trust ────────────────────────────────────────────────────────────────────

  async getTrustScore(): Promise<TrustScore> {
    const score = await this.walletContract.getTrustScore();
    const numScore = Number(score);
    return {
      score: numScore,
      level: this.trust.getTrustLevel(numScore),
      nextLevelAt: getNextLevelAt(numScore),
    };
  }

  // ── Attestation history ───────────────────────────────────────────────────────

  async getAttestations(limit: number = 50): Promise<Intent[]> {
    const provider = this.signer.provider;
    if (!provider) return [];

    const iface = new ethers.Interface(INTENT_ATTESTATION_ABI);
    const eventFragment = iface.getEvent("AttestationCreated");
    if (!eventFragment) return [];

    const walletTopic = ethers.zeroPadValue(this.walletAddress.toLowerCase(), 32);
    const filter = {
      address: this.contracts.intentAttestation,
      topics: [
        eventFragment.topicHash,
        null,
        walletTopic,
      ],
      fromBlock: 0,
    };

    const logs = await provider.getLogs(filter);
    return logs.slice(-limit).map((log) => {
      const parsed = iface.parseLog(log)!;
      return {
        attestationId: parsed.args.id as string,
        action: parsed.args.action as string,
        reason: parsed.args.reason as string,
        recipient: parsed.args.recipient as string,
        amount: BigInt(parsed.args.amount),
        wallet: parsed.args.wallet as string,
        timestamp: Number(parsed.args.timestamp),
      };
    });
  }
}

// Aliases for backward compat
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

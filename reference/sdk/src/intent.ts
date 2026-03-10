import { ethers } from "ethers";
import { Intent } from "./types";

const INTENT_ATTESTATION_ABI = [
  "function attest(bytes32 attestationId, string calldata action, string calldata reason, address recipient, uint256 amount) external",
  "function verify(bytes32 attestationId, address wallet) external view returns (bool)",
  "function getAttestation(bytes32 attestationId) external view returns (bytes32, address, string, string, address, uint256, uint256)",
];

export class IntentAttestationClient {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private walletAddress: string;

  constructor(address: string, signer: ethers.Signer, walletAddress: string) {
    this.contract = new ethers.Contract(address, INTENT_ATTESTATION_ABI, signer);
    this.signer = signer;
    this.walletAddress = walletAddress;
  }

  async create(
    action: string,
    reason: string,
    recipient: string,
    amount: bigint
  ): Promise<string> {
    const attestationId = ethers.keccak256(
      ethers.toUtf8Bytes(`${action}:${reason}:${recipient}:${amount}:${Date.now()}`)
    );
    const tx = await this.contract.attest(attestationId, action, reason, recipient, amount);
    await tx.wait();
    return attestationId;
  }

  async verify(attestationId: string, walletAddress: string): Promise<boolean> {
    return await this.contract.verify(attestationId, walletAddress);
  }

  async get(attestationId: string): Promise<Intent> {
    const [id, , action, reason, recipient, amount] =
      await this.contract.getAttestation(attestationId);
    return {
      attestationId: id,
      action,
      reason,
      recipient,
      amount: BigInt(amount),
    };
  }
}

// Alias for backward compat with index.ts export name
export class IntentAttestation extends IntentAttestationClient {
  constructor(address: string, signer: ethers.Signer, walletAddress: string) {
    super(address, signer, walletAddress);
  }
}

import { AbstractSigner, ContractRunner, ethers } from "ethers";
import type { ChannelState } from "./types";
import { ChannelClient } from "./channel";

const WATCHTOWER_REGISTRY_ABI = [
  "function register(string name, string description, string[] capabilities) external",
  "function getWatchtower(address watchtower) external view returns (tuple(address addr, string name, string description, string[] capabilities, bool active, uint256 registeredAt))",
  "function isRegistered(address watchtower) external view returns (bool)",
  "event WatchtowerRegistered(address indexed watchtower, string name)",
] as const;

const SESSION_CHANNEL_WATCHTOWER_ABI = [
  "function authorizeWatchtower(bytes32 channelId, address watchtower) external",
  "function revokeWatchtower(bytes32 channelId, address watchtower) external",
  "function submitWatchtowerChallenge(bytes32 channelId, bytes latestState, address beneficiary) external",
  "function isWatchtowerAuthorized(bytes32 channelId, address watchtower) external view returns (bool)",
] as const;

export interface WatchtowerMetadata {
  name: string;
  description: string;
  capabilities: string[];
}

export interface WatchtowerStatus {
  addr: string;
  name: string;
  description: string;
  capabilities: string[];
  active: boolean;
  registeredAt: number;
}

export class WatchtowerClient {
  private registry: ethers.Contract;
  private channelContract: ethers.Contract;
  private signer: ethers.Signer | null;
  private _channelClient: ChannelClient;

  constructor(
    registryAddress: string,
    channelContractAddress: string,
    runner: ContractRunner
  ) {
    this.registry = new ethers.Contract(registryAddress, WATCHTOWER_REGISTRY_ABI, runner);
    this.channelContract = new ethers.Contract(channelContractAddress, SESSION_CHANNEL_WATCHTOWER_ABI, runner);
    this.signer = runner instanceof AbstractSigner ? (runner as ethers.Signer) : null;
    this._channelClient = new ChannelClient(channelContractAddress, runner);
  }

  /**
   * Register this node as a watchtower in the WatchtowerRegistry.
   */
  async registerWatchtower(metadata: WatchtowerMetadata): Promise<{ txHash: string }> {
    if (!this.signer) throw new Error("Signer required");
    const tx = await this.registry.register(metadata.name, metadata.description, metadata.capabilities);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  /**
   * Submit a watchtower challenge on behalf of `beneficiary`.
   * The `state` must be a doubly-signed ChannelState with a higher sequenceNumber
   * than the one currently recorded on-chain.
   */
  async submitChallenge(
    channelId: string,
    state: ChannelState,
    beneficiary: string
  ): Promise<{ txHash: string }> {
    if (!this.signer) throw new Error("Signer required");
    const encoded = this._channelClient.encodeChannelState(state);
    const tx = await this.channelContract.submitWatchtowerChallenge(channelId, encoded, beneficiary);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  /**
   * Get the on-chain registration status of a watchtower address.
   */
  async getWatchtowerStatus(watchtowerAddress: string): Promise<WatchtowerStatus> {
    const raw = await this.registry.getWatchtower(watchtowerAddress);
    return {
      addr: raw.addr,
      name: raw.name,
      description: raw.description,
      capabilities: [...raw.capabilities],
      active: raw.active,
      registeredAt: Number(raw.registeredAt),
    };
  }

  /**
   * Authorize a watchtower to challenge on your behalf for a specific channel.
   */
  async authorizeWatchtower(channelId: string, watchtower: string): Promise<{ txHash: string }> {
    if (!this.signer) throw new Error("Signer required");
    const tx = await this.channelContract.authorizeWatchtower(channelId, watchtower);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  /**
   * Revoke a watchtower's authorization for a channel.
   */
  async revokeWatchtower(channelId: string, watchtower: string): Promise<{ txHash: string }> {
    if (!this.signer) throw new Error("Signer required");
    const tx = await this.channelContract.revokeWatchtower(channelId, watchtower);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  /**
   * Check whether a watchtower is authorized for a channel.
   */
  async isWatchtowerAuthorized(channelId: string, watchtower: string): Promise<boolean> {
    return this.channelContract.isWatchtowerAuthorized(channelId, watchtower);
  }

  /** Expose ChannelClient for polling in watch loops. */
  get channelClient(): ChannelClient {
    return this._channelClient;
  }
}

import { ethers } from "ethers";
import type { Arc402Config } from "./config";

export const DEFAULT_ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
export const DEFAULT_BUNDLER_URL = "https://api.pimlico.io/v2/base/rpc";

export type UserOperation = {
  sender: string;
  nonce: string;                              // hex
  callData: string;                           // hex
  callGasLimit: string;                       // hex
  verificationGasLimit: string;               // hex
  preVerificationGas: string;                 // hex
  maxFeePerGas: string;                       // hex
  maxPriorityFeePerGas: string;              // hex
  signature: string;                          // hex — empty for policy-auto-approved ops
  factory?: string;
  factoryData?: string;
  paymaster?: string;
  paymasterData?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
};

export type GasEstimate = {
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
};

export type UserOpReceipt = {
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  success: boolean;
  actualGasCost: string;
  actualGasUsed: string;
  logs: unknown[];
  receipt: {
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    [key: string]: unknown;
  };
};

type RpcResponse = {
  result?: unknown;
  error?: { code: number; message: string };
};

export class BundlerClient {
  private bundlerUrl: string;
  private entryPointAddress: string;
  private chainId: number;

  constructor(bundlerUrl: string, entryPointAddress: string, chainId: number) {
    this.bundlerUrl = bundlerUrl;
    this.entryPointAddress = entryPointAddress;
    this.chainId = chainId;
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`Bundler HTTP ${response.status}: ${response.statusText}`);
    }
    const json = (await response.json()) as RpcResponse;
    if (json.error) {
      throw new Error(`Bundler RPC error [${json.error.code}]: ${json.error.message}`);
    }
    return json.result;
  }

  async sendUserOperation(userOp: UserOperation): Promise<string> {
    const hash = await this.rpc("eth_sendUserOperation", [userOp, this.entryPointAddress]);
    return hash as string;
  }

  async getUserOperationReceipt(userOpHash: string): Promise<UserOpReceipt> {
    const POLL_INTERVAL_MS = 2000;
    const MAX_ATTEMPTS = 30;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const receipt = await this.rpc("eth_getUserOperationReceipt", [userOpHash]);
      if (receipt !== null && receipt !== undefined) {
        return receipt as UserOpReceipt;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `UserOperation ${userOpHash} not confirmed after ${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`
    );
  }

  async estimateUserOperationGas(userOp: Partial<UserOperation>): Promise<GasEstimate> {
    const estimate = await this.rpc("eth_estimateUserOperationGas", [
      userOp,
      this.entryPointAddress,
    ]);
    return estimate as GasEstimate;
  }
}

export async function buildUserOp(
  callData: string,
  sender: string,
  nonce: bigint,
  config: Arc402Config
): Promise<UserOperation> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const feeData = await provider.getFeeData();

  const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(1_000_000_000);
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(100_000_000);

  return {
    sender,
    nonce: ethers.toBeHex(nonce),
    callData,
    callGasLimit: ethers.toBeHex(300_000),
    verificationGasLimit: ethers.toBeHex(150_000),
    preVerificationGas: ethers.toBeHex(50_000),
    maxFeePerGas: ethers.toBeHex(maxFeePerGas),
    maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
    signature: "0x",
  };
}

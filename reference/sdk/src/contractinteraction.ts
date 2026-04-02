import { ContractRunner, ethers } from "ethers";
import { INTENT_ATTESTATION_ABI } from "./contracts";
import { Intent } from "./types";

export interface IntentPayload {
  target: string;
  data: string;
  value: bigint;
  minReturnValue: bigint;
  maxApprovalAmount: bigint;
  approvalToken: string;
}

export interface ContractCallAttestation {
  attestationId: string;
  intent: Intent;
  payload: IntentPayload;
}

export interface ContractCallResult {
  txHash: string;
  success: boolean;
  returnData?: string;
  blockNumber?: number;
}

const ARC402_WALLET_EXECUTE_ABI = [
  "function executeContractCall((address target, bytes data, uint256 value, uint256 minReturnValue, uint256 maxApprovalAmount, address approvalToken) params) external returns (bytes memory)",
] as const;

export class ContractInteractionClient {
  private intentContract: ethers.Contract;
  private provider: ethers.Provider;

  constructor(
    intentAttestationAddress: string,
    runner: ContractRunner,
    private walletAddress: string,
  ) {
    this.intentContract = new ethers.Contract(intentAttestationAddress, INTENT_ATTESTATION_ABI, runner);
    this.provider = (runner as ethers.Signer).provider ?? (runner as ethers.Provider);
  }

  /** Encode a contract method call into an IntentPayload ready for on-chain execution. */
  buildContractCall(
    target: string,
    abi: readonly string[] | unknown[],
    method: string,
    args: unknown[],
    options: {
      value?: bigint;
      minReturnValue?: bigint;
      maxApprovalAmount?: bigint;
      approvalToken?: string;
    } = {},
  ): IntentPayload {
    const iface = new ethers.Interface(abi as string[]);
    const data = iface.encodeFunctionData(method, args);
    return {
      target,
      data,
      value: options.value ?? 0n,
      minReturnValue: options.minReturnValue ?? 0n,
      maxApprovalAmount: options.maxApprovalAmount ?? 0n,
      approvalToken: options.approvalToken ?? ethers.ZeroAddress,
    };
  }

  /**
   * Create an intent attestation for the contract call. Records agent intent
   * on-chain before execution — provides auditable pre-execution evidence.
   */
  async signAndAttestContractCall(
    payload: IntentPayload,
    signer: ethers.Signer,
  ): Promise<ContractCallAttestation> {
    const methodSelector = payload.data.slice(0, 10); // 4-byte selector
    const action = `CONTRACT_CALL:${payload.target}:${methodSelector}`;
    const reason = `Executing contract call to ${payload.target} with value=${payload.value}`;

    const attestationId = ethers.keccak256(
      ethers.toUtf8Bytes(
        `${this.walletAddress}:${action}:${reason}:${payload.target}:${payload.value}:${Date.now()}`,
      ),
    );

    const contractWithSigner = this.intentContract.connect(signer) as ethers.Contract & {
      attest: (id: string, action: string, reason: string, recipient: string, amount: bigint) => Promise<ethers.ContractTransactionResponse>;
    };
    const tx = await contractWithSigner.attest(
      attestationId,
      action,
      reason,
      payload.target,
      payload.value,
    );
    await tx.wait();

    const [id, wallet, attestedAction, attestedReason, recipient, amount, timestamp] =
      await this.intentContract.getAttestation(attestationId);

    const intent: Intent = {
      attestationId: id,
      wallet,
      action: attestedAction,
      reason: attestedReason,
      recipient,
      amount: BigInt(amount),
      timestamp: Number(timestamp),
    };

    return { attestationId, intent, payload };
  }

  /**
   * Execute a contract call under a ServiceAgreement escrow via the ARC402Wallet.
   * The wallet enforces PolicyEngine validation, per-tx approvals, and slippage guards.
   */
  async executeWithEscrow(
    walletContractAddress: string,
    payload: IntentPayload,
    signer: ethers.Signer,
  ): Promise<ethers.ContractTransactionResponse> {
    const walletContract = new ethers.Contract(
      walletContractAddress,
      ARC402_WALLET_EXECUTE_ABI,
      signer,
    );
    return walletContract.executeContractCall(payload, { value: payload.value });
  }

  /** Verify the result of a previously submitted contract call transaction. */
  async verifyContractCallResult(
    txHash: string,
    expectedResult?: string,
  ): Promise<ContractCallResult> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { txHash, success: false };
    }

    const success = receipt.status === 1;

    if (expectedResult && success) {
      const tx = await this.provider.getTransaction(txHash);
      const returnData = tx ? await this.provider.call({ to: tx.to!, data: tx.data, blockTag: receipt.blockNumber }) : undefined;
      return {
        txHash,
        success: returnData === expectedResult,
        returnData,
        blockNumber: receipt.blockNumber,
      };
    }

    return { txHash, success, blockNumber: receipt.blockNumber };
  }
}

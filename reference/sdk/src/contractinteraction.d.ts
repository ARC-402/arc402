import { ContractRunner, ethers } from "ethers";
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
export declare class ContractInteractionClient {
    private walletAddress;
    private intentContract;
    private provider;
    constructor(intentAttestationAddress: string, runner: ContractRunner, walletAddress: string);
    /** Encode a contract method call into an IntentPayload ready for on-chain execution. */
    buildContractCall(target: string, abi: readonly string[] | unknown[], method: string, args: unknown[], options?: {
        value?: bigint;
        minReturnValue?: bigint;
        maxApprovalAmount?: bigint;
        approvalToken?: string;
    }): IntentPayload;
    /**
     * Create an intent attestation for the contract call. Records agent intent
     * on-chain before execution — provides auditable pre-execution evidence.
     */
    signAndAttestContractCall(payload: IntentPayload, signer: ethers.Signer): Promise<ContractCallAttestation>;
    /**
     * Execute a contract call under a ServiceAgreement escrow via the ARC402Wallet.
     * The wallet enforces PolicyEngine validation, per-tx approvals, and slippage guards.
     */
    executeWithEscrow(walletContractAddress: string, payload: IntentPayload, signer: ethers.Signer): Promise<ethers.ContractTransactionResponse>;
    /** Verify the result of a previously submitted contract call transaction. */
    verifyContractCallResult(txHash: string, expectedResult?: string): Promise<ContractCallResult>;
}
//# sourceMappingURL=contractinteraction.d.ts.map
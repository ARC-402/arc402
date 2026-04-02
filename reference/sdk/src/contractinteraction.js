"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractInteractionClient = void 0;
const ethers_1 = require("ethers");
const contracts_1 = require("./contracts");
const ARC402_WALLET_EXECUTE_ABI = [
    "function executeContractCall((address target, bytes data, uint256 value, uint256 minReturnValue, uint256 maxApprovalAmount, address approvalToken) params) external returns (bytes memory)",
];
class ContractInteractionClient {
    constructor(intentAttestationAddress, runner, walletAddress) {
        this.walletAddress = walletAddress;
        this.intentContract = new ethers_1.ethers.Contract(intentAttestationAddress, contracts_1.INTENT_ATTESTATION_ABI, runner);
        this.provider = runner.provider ?? runner;
    }
    /** Encode a contract method call into an IntentPayload ready for on-chain execution. */
    buildContractCall(target, abi, method, args, options = {}) {
        const iface = new ethers_1.ethers.Interface(abi);
        const data = iface.encodeFunctionData(method, args);
        return {
            target,
            data,
            value: options.value ?? 0n,
            minReturnValue: options.minReturnValue ?? 0n,
            maxApprovalAmount: options.maxApprovalAmount ?? 0n,
            approvalToken: options.approvalToken ?? ethers_1.ethers.ZeroAddress,
        };
    }
    /**
     * Create an intent attestation for the contract call. Records agent intent
     * on-chain before execution — provides auditable pre-execution evidence.
     */
    async signAndAttestContractCall(payload, signer) {
        const methodSelector = payload.data.slice(0, 10); // 4-byte selector
        const action = `CONTRACT_CALL:${payload.target}:${methodSelector}`;
        const reason = `Executing contract call to ${payload.target} with value=${payload.value}`;
        const attestationId = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(`${this.walletAddress}:${action}:${reason}:${payload.target}:${payload.value}:${Date.now()}`));
        const contractWithSigner = this.intentContract.connect(signer);
        const tx = await contractWithSigner.attest(attestationId, action, reason, payload.target, payload.value);
        await tx.wait();
        const [id, wallet, attestedAction, attestedReason, recipient, amount, timestamp] = await this.intentContract.getAttestation(attestationId);
        const intent = {
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
    async executeWithEscrow(walletContractAddress, payload, signer) {
        const walletContract = new ethers_1.ethers.Contract(walletContractAddress, ARC402_WALLET_EXECUTE_ABI, signer);
        return walletContract.executeContractCall(payload, { value: payload.value });
    }
    /** Verify the result of a previously submitted contract call transaction. */
    async verifyContractCallResult(txHash, expectedResult) {
        const receipt = await this.provider.getTransactionReceipt(txHash);
        if (!receipt) {
            return { txHash, success: false };
        }
        const success = receipt.status === 1;
        if (expectedResult && success) {
            const tx = await this.provider.getTransaction(txHash);
            const returnData = tx ? await this.provider.call({ to: tx.to, data: tx.data }, receipt.blockNumber) : undefined;
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
exports.ContractInteractionClient = ContractInteractionClient;
//# sourceMappingURL=contractinteraction.js.map
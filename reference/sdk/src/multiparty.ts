import { ContractRunner, ethers } from "ethers";
import { AGREEMENT_TREE_ABI } from "./contracts";
import { ServiceAgreementClient } from "./agreement";
import { ProposeParams } from "./types";

export interface AgreementTree {
  root: bigint;
  path: bigint[];
  children: bigint[];
  depth: number;
  allSettled: boolean;
}

export interface PaymentSplit {
  address: string;
  percentage: number;
}

export interface PaymentDistribution {
  total: bigint;
  distributions: Array<{ address: string; amount: bigint; percentage: number }>;
}

export interface CreateAgreementResult {
  rootAgreementId: bigint;
  childAgreementIds: bigint[];
}

export class AgreementTreeClient {
  private treeContract: ethers.Contract;
  private agreementClient: ServiceAgreementClient;

  constructor(treeAddress: string, agreementAddress: string, runner: ContractRunner) {
    this.treeContract = new ethers.Contract(treeAddress, AGREEMENT_TREE_ABI, runner);
    this.agreementClient = new ServiceAgreementClient(agreementAddress, runner);
  }

  async registerSubAgreement(params: {
    parentAgreementId: bigint;
    childAgreementId: bigint;
  }): Promise<ethers.TransactionReceipt> {
    const tx = await this.treeContract.registerSubAgreement(
      params.parentAgreementId,
      params.childAgreementId,
    );
    return tx.wait();
  }

  /**
   * Propose the root agreement, then propose each child agreement and register
   * them all under the root in the AgreementTree contract.
   *
   * The caller must be the client for the root agreement AND the provider for
   * all child agreements (i.e. the middle-layer agent that subcontracts work).
   */
  async createAgreement(
    rootTerms: ProposeParams,
    childAgreements: ProposeParams[],
  ): Promise<CreateAgreementResult> {
    const { agreementId: rootAgreementId } = await this.agreementClient.propose(rootTerms);

    const childAgreementIds: bigint[] = [];
    for (const child of childAgreements) {
      const { agreementId: childId } = await this.agreementClient.propose(child);
      await this.registerSubAgreement({
        parentAgreementId: rootAgreementId,
        childAgreementId: childId,
      });
      childAgreementIds.push(childId);
    }

    return { rootAgreementId, childAgreementIds };
  }

  async getAgreementTree(rootAgreementId: bigint): Promise<AgreementTree> {
    const id = BigInt(rootAgreementId);
    const [root, path, children, depth, allSettled] = await Promise.all([
      this.treeContract.getRoot(id),
      this.treeContract.getPath(id),
      this.treeContract.getChildren(id),
      this.treeContract.getDepth(id),
      this.treeContract.allChildrenSettled(id),
    ]);
    return {
      root: BigInt(root),
      path: (path as bigint[]).map(BigInt),
      children: (children as bigint[]).map(BigInt),
      depth: Number(depth),
      allSettled: Boolean(allSettled),
    };
  }

  /** Alias for getAgreementTree — matches spec SDK interface. */
  async getTree(agreementId: bigint): Promise<AgreementTree> {
    return this.getAgreementTree(agreementId);
  }

  async treeStatus(agreementId: bigint): Promise<{ allSettled: boolean; childCount: number }> {
    const [allSettled, children] = await Promise.all([
      this.treeContract.allChildrenSettled(BigInt(agreementId)),
      this.treeContract.getChildren(BigInt(agreementId)),
    ]);
    return {
      allSettled: Boolean(allSettled),
      childCount: (children as bigint[]).length,
    };
  }

  /**
   * Off-chain payment distribution helper.
   * Splits paymentAmount across recipients according to their percentage shares.
   * Percentages must sum to 100. This does not touch the chain.
   */
  splitPayment(
    paymentAmount: bigint,
    splits: PaymentSplit[],
  ): PaymentDistribution {
    const totalPct = splits.reduce((sum, s) => sum + s.percentage, 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      throw new Error(`Split percentages must sum to 100 (got ${totalPct})`);
    }

    const distributions = splits.map((s) => ({
      address: s.address,
      percentage: s.percentage,
      // Use integer basis points (x100) to avoid floating-point in BigInt arithmetic
      amount: (paymentAmount * BigInt(Math.round(s.percentage * 100))) / 10000n,
    }));

    return { total: paymentAmount, distributions };
  }
}

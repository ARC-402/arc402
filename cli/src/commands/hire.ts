import { Command } from "commander";
import { ServiceAgreementClient, SessionManager } from "@arc402/sdk";
import { ethers } from "ethers";
import { getUsdcAddress, loadConfig } from "../config";
import { requireSigner } from "../client";
import { hashFile, hashString } from "../utils/hash";
import { parseDuration } from "../utils/time";

const sessionManager = new SessionManager();

export function registerHireCommand(program: Command): void {
  program
    .command("hire")
    .description("Create the on-chain commitment after off-chain negotiation")
    .requiredOption("--agent <address>")
    .requiredOption("--task <description>")
    .requiredOption("--service-type <type>")
    .option("--max <amount>", "Max price (required unless --session is provided)")
    .option("--deadline <duration>", "Deadline duration (required unless --session is provided)")
    .option("--token <token>", "eth or usdc", "eth")
    .option("--deliverable-spec <filepath>")
    .option("--session <sessionId>", "Load agreed price and deadline from a completed negotiation session")
    .option("--json")
    .action(async (opts) => {
      const config = loadConfig();
      if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
      const { signer, address } = await requireSigner(config);
      const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);

      let maxAmount: string;
      let deadlineArg: string;
      let transcriptHash: string | undefined;

      if (opts.session) {
        const session = sessionManager.load(opts.session);
        if (session.state !== "ACCEPTED") throw new Error(`Session ${opts.session} is not in ACCEPTED state (state: ${session.state})`);
        if (!session.agreedPrice || !session.agreedDeadline) throw new Error(`Session ${opts.session} is missing agreedPrice or agreedDeadline`);
        maxAmount = session.agreedPrice;
        deadlineArg = session.agreedDeadline;
        transcriptHash = session.transcriptHash;
      } else {
        if (!opts.max) throw new Error("--max is required when --session is not provided");
        if (!opts.deadline) throw new Error("--deadline is required when --session is not provided");
        maxAmount = opts.max;
        deadlineArg = opts.deadline;
      }

      const useUsdc = String(opts.token).toLowerCase() === "usdc";
      const token = useUsdc ? getUsdcAddress(config) : ethers.ZeroAddress;
      const price = useUsdc ? BigInt(Math.round(Number(maxAmount) * 1_000_000)) : BigInt(maxAmount);

      if (useUsdc) {
        const usdc = new ethers.Contract(
          token,
          ["function approve(address spender,uint256 amount) external returns (bool)", "function allowance(address owner,address spender) external view returns (uint256)"],
          signer
        );
        const allowance = await usdc.allowance(address, config.serviceAgreementAddress);
        if (allowance < price) await (await usdc.approve(config.serviceAgreementAddress, price)).wait();
      }

      // Use spec hash as deliverables hash; if transcript exists, incorporate it
      const baseHash = opts.deliverableSpec ? hashFile(opts.deliverableSpec) : hashString(opts.task);
      const deliverablesHash = transcriptHash
        ? (ethers.keccak256(ethers.toUtf8Bytes(baseHash + transcriptHash)) as `0x${string}`)
        : baseHash;

      // Parse deadline: if it looks like an ISO date, convert to seconds from now
      let deadlineSeconds: number;
      const isoMatch = deadlineArg.match(/^\d{4}-\d{2}-\d{2}/);
      if (isoMatch) {
        const target = Math.floor(new Date(deadlineArg).getTime() / 1000);
        deadlineSeconds = target - Math.floor(Date.now() / 1000);
        if (deadlineSeconds <= 0) throw new Error(`Deadline ${deadlineArg} is in the past`);
      } else {
        deadlineSeconds = parseDuration(deadlineArg);
      }

      const result = await client.propose({
        provider: opts.agent,
        serviceType: opts.serviceType,
        description: opts.task,
        price,
        token,
        deadline: deadlineSeconds,
        deliverablesHash,
      });

      if (opts.session) {
        sessionManager.setOnChainId(opts.session, result.agreementId.toString());
      }

      if (opts.json) {
        const output: Record<string, unknown> = { agreementId: result.agreementId.toString(), deliverablesHash };
        if (transcriptHash) output.transcriptHash = transcriptHash;
        if (opts.session) output.sessionId = opts.session;
        return console.log(JSON.stringify(output, null, 2));
      }

      console.log(`agreementId=${result.agreementId} deliverablesHash=${deliverablesHash}`);
      if (transcriptHash) console.log(`transcriptHash=${transcriptHash}`);
    });
}

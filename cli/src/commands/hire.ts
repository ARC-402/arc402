import { Command } from "commander";
import { ServiceAgreementClient } from "@arc402/sdk";
import { ethers } from "ethers";
import { getUsdcAddress, loadConfig } from "../config";
import { requireSigner } from "../client";
import { hashFile, hashString } from "../utils/hash";
import { parseDuration } from "../utils/time";

export function registerHireCommand(program: Command): void {
  program.command("hire").description("Create the on-chain commitment after off-chain negotiation").requiredOption("--agent <address>").requiredOption("--task <description>").requiredOption("--service-type <type>").requiredOption("--max <amount>").requiredOption("--deadline <duration>").option("--token <token>", "eth or usdc", "eth").option("--deliverable-spec <filepath>").option("--json").action(async (opts) => {
    const config = loadConfig(); if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
    const { signer, address } = await requireSigner(config); const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);
    const useUsdc = String(opts.token).toLowerCase() === "usdc"; const token = useUsdc ? getUsdcAddress(config) : ethers.ZeroAddress;
    const price = useUsdc ? BigInt(Math.round(Number(opts.max) * 1_000_000)) : ethers.parseEther(opts.max);
    if (useUsdc) { const usdc = new ethers.Contract(token, ["function approve(address spender,uint256 amount) external returns (bool)","function allowance(address owner,address spender) external view returns (uint256)"], signer); const allowance = await usdc.allowance(address, config.serviceAgreementAddress); if (allowance < price) await (await usdc.approve(config.serviceAgreementAddress, price)).wait(); }
    const deliverablesHash = opts.deliverableSpec ? hashFile(opts.deliverableSpec) : hashString(opts.task);
    const result = await client.propose({ provider: opts.agent, serviceType: opts.serviceType, description: opts.task, price, token, deadline: parseDuration(opts.deadline), deliverablesHash });
    if (opts.json) return console.log(JSON.stringify({ agreementId: result.agreementId.toString(), deliverablesHash }, null, 2));
    console.log(`agreementId=${result.agreementId} deliverablesHash=${deliverablesHash}`);
  });
}

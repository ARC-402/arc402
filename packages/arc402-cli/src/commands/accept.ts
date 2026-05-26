import { Command } from "commander";
import { ServiceAgreementClient } from "@arc402/sdk";
import { ethers } from "ethers";
import { getCanonicalAgentRegistryAddress, loadConfig } from "../config";
import { requireSigner } from "../client";
import { printSenderInfo, executeContractWriteViaWallet, assertEoaBypassAllowed } from "../wallet-router";
import { SERVICE_AGREEMENT_ABI } from "../abis";
import { resolveAgentEndpoint, notifyAgent } from "../endpoint-notify";
import { c } from "../ui/colors";
import { startSpinner } from "../ui/spinner";

export function registerAcceptCommand(program: Command): void {
  program.command("accept <id>").description("Provider accepts a proposed agreement using the ARC-402 wallet as the provider identity")
    .option("--use-eoa", "Compatibility mode only: sign directly with machine key EOA, bypassing ARC-402 wallet identity and policy enforcement")
    .action(async (id, opts) => {
    const config = loadConfig();
    if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
    assertEoaBypassAllowed(config, !!opts.useEoa, "arc402 accept");
    const { signer, address: signerAddress } = await requireSigner(config);
    printSenderInfo(config);

    // Read agreement to get client address for endpoint notification
    let clientAddress = "";
    try {
      const prefProvider = new ethers.JsonRpcProvider(config.rpcUrl);
      const saContract = new ethers.Contract(
        config.serviceAgreementAddress,
        ["function getAgreement(uint256 id) external view returns (tuple(uint256 id, address client, address provider, string serviceType, string description, uint256 price, address token, uint256 deadline, bytes32 deliverablesHash, uint8 status, uint256 createdAt, uint256 resolvedAt, uint256 verifyWindowEnd, bytes32 committedHash))"],
        prefProvider
      );
      const ag = await saContract.getAgreement(BigInt(id));
      clientAddress = String(ag.client ?? "");
    } catch { /* non-fatal */ }

    const spinner = startSpinner("Submitting transaction...");
    try {
      if (config.walletContractAddress && !opts.useEoa) {
        await executeContractWriteViaWallet(
          config.walletContractAddress, signer, config.serviceAgreementAddress,
          SERVICE_AGREEMENT_ABI, "accept", [BigInt(id)],
        );
      } else {
        const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);
        await client.accept(BigInt(id));
      }
      spinner.succeed();
    } catch (err) {
      spinner.fail();
      throw err;
    }
    console.log(' ' + c.success + c.white(` Accepted — agreement #${id}`));

    // Notify client's HTTP endpoint (non-blocking)
    if (clientAddress) {
      try {
        const notifyProvider = new ethers.JsonRpcProvider(config.rpcUrl);
        const registryAddress = getCanonicalAgentRegistryAddress(config);
        const endpoint = await resolveAgentEndpoint(clientAddress, notifyProvider, registryAddress);
        const payload = { agreementId: id, from: signerAddress };
        await notifyAgent(endpoint, "/hire/accepted", payload);
        await notifyAgent(endpoint, "/delivery/accepted", payload);
      } catch (err) {
        console.warn(' ' + c.warning + c.white(` Could not notify client endpoint: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  });
}

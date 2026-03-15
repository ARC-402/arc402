import { Command } from "commander";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { ContractInteractionClient, IntentPayload } from "@arc402/sdk";

export function registerContractInteractionCommands(program: Command): void {
  const contract = program.command("contract").description("Direct contract interaction via ARC402Wallet");

  contract
    .command("call <target> <method> [args...]")
    .description("Build, attest, and optionally execute an arbitrary contract call")
    .option("--abi <json>", "ABI fragment array as JSON string, e.g. '[\"function swap(...)\"]'")
    .option("--value <wei>", "ETH value to send with the call (in wei)", "0")
    .option("--min-return <value>", "Minimum return value for slippage guard", "0")
    .option("--approval-token <address>", "ERC-20 token to approve before call", ethers.ZeroAddress)
    .option("--approval-amount <value>", "Max ERC-20 approval for this call (in token units)", "0")
    .option("--with-agreement <id>", "Execute under ServiceAgreement escrow (requires walletContractAddress in config)")
    .option("--attest", "Create intent attestation before executing (requires intentAttestationAddress in config)")
    .option("--dry-run", "Build and print the encoded payload without executing")
    .option("--json", "Output as JSON")
    .action(async (target: string, method: string, rawArgs: string[], opts) => {
      const config = loadConfig();
      const { signer, address } = await requireSigner(config);

      // Parse ABI — accept a JSON array of ABI fragments, or construct a minimal one
      let abi: string[];
      if (opts.abi) {
        try {
          abi = JSON.parse(opts.abi) as string[];
        } catch {
          console.error("--abi must be a valid JSON array of ABI fragments");
          process.exit(1);
        }
      } else {
        // Construct a minimal ABI fragment for the method with inferred arg types
        const argTypes = rawArgs.map(() => "bytes32").join(", ");
        abi = [`function ${method}(${argTypes})`];
      }

      // Parse args — attempt JSON parsing for each arg (handles numbers, arrays, objects)
      const parsedArgs = rawArgs.map((a) => {
        try {
          return JSON.parse(a);
        } catch {
          return a;
        }
      });

      const intentAttestationAddress = config.intentAttestationAddress;
      if (!intentAttestationAddress) {
        console.error("intentAttestationAddress missing in config");
        process.exit(1);
      }

      const client = new ContractInteractionClient(intentAttestationAddress, signer, address);

      let payload: IntentPayload;
      try {
        payload = client.buildContractCall(target, abi, method, parsedArgs, {
          value: BigInt(opts.value),
          minReturnValue: BigInt(opts.minReturn),
          maxApprovalAmount: BigInt(opts.approvalAmount),
          approvalToken: opts.approvalToken,
        });
      } catch (err) {
        console.error(`Failed to encode call: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      if (opts.dryRun || (!opts.withAgreement && !opts.attest)) {
        if (opts.json) {
          console.log(JSON.stringify({
            target: payload.target,
            data: payload.data,
            value: payload.value.toString(),
            minReturnValue: payload.minReturnValue.toString(),
            maxApprovalAmount: payload.maxApprovalAmount.toString(),
            approvalToken: payload.approvalToken,
          }, null, 2));
        } else {
          console.log(`target:           ${payload.target}`);
          console.log(`method:           ${method}`);
          console.log(`calldata:         ${payload.data}`);
          console.log(`value:            ${payload.value} wei`);
          console.log(`minReturnValue:   ${payload.minReturnValue}`);
          console.log(`approvalToken:    ${payload.approvalToken}`);
          console.log(`maxApprovalAmount:${payload.maxApprovalAmount}`);
        }
        return;
      }

      // Attest intent before execution if requested
      let attestationId: string | undefined;
      if (opts.attest) {
        console.log("Creating intent attestation…");
        try {
          const attestation = await client.signAndAttestContractCall(payload, signer);
          attestationId = attestation.attestationId;
          console.log(`attestationId: ${attestationId}`);
        } catch (err) {
          console.error(`Attestation failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }

      // Execute under agreement escrow
      if (opts.withAgreement !== undefined) {
        if (!config.walletContractAddress) {
          console.error("walletContractAddress missing in config — required for --with-agreement");
          process.exit(1);
        }

        console.log(`Executing contract call under agreement ${opts.withAgreement}…`);
        try {
          const tx = await client.executeWithEscrow(config.walletContractAddress, payload, signer);
          const receipt = await tx.wait();

          if (opts.json) {
            console.log(JSON.stringify({
              txHash: receipt!.hash,
              status: receipt!.status === 1 ? "success" : "reverted",
              blockNumber: receipt!.blockNumber,
              ...(attestationId ? { attestationId } : {}),
            }, null, 2));
          } else {
            console.log(`tx:    ${receipt!.hash}`);
            console.log(`block: ${receipt!.blockNumber}`);
            console.log(`status: ${receipt!.status === 1 ? "success" : "reverted"}`);
            if (attestationId) console.log(`attestationId: ${attestationId}`);
          }
        } catch (err) {
          console.error(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }
    });

  contract
    .command("verify <txHash>")
    .description("Verify the result of a previously submitted contract call")
    .option("--expected <hex>", "Expected return data (hex) to verify against")
    .option("--json")
    .action(async (txHash: string, opts) => {
      const config = loadConfig();
      const { signer, address } = await requireSigner(config);

      const intentAttestationAddress = config.intentAttestationAddress;
      if (!intentAttestationAddress) {
        console.error("intentAttestationAddress missing in config");
        process.exit(1);
      }

      const client = new ContractInteractionClient(intentAttestationAddress, signer, address);
      const result = await client.verifyContractCallResult(txHash, opts.expected);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`txHash:      ${result.txHash}`);
        console.log(`success:     ${result.success}`);
        if (result.blockNumber !== undefined) console.log(`blockNumber: ${result.blockNumber}`);
        if (result.returnData) console.log(`returnData:  ${result.returnData}`);
      }
    });
}

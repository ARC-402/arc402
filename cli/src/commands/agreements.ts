import { Command } from "commander";
import { AgreementStatus, ServiceAgreementClient } from "@arc402/sdk";
import { loadConfig } from "../config";
import { getClient } from "../client";
import { agreementStatusLabel, formatDate, printTable, truncateAddress } from "../utils/format";
import { formatDeadline } from "../utils/time";

export function registerAgreementsCommands(program: Command): void {
  program.command("agreements").description("List agreements for the configured wallet").option("--as <role>", "client or provider", "client").option("--json").action(async (opts) => {
    const config = loadConfig(); if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
    const { provider, address } = await getClient(config); if (!address) throw new Error("No wallet configured"); const client = new ServiceAgreementClient(config.serviceAgreementAddress, provider);
    const agreements = opts.as === "provider" ? await client.getProviderAgreements(address) : await client.getClientAgreements(address);
    if (opts.json) return console.log(JSON.stringify(agreements, (_k, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    printTable(["ID", "COUNTERPARTY", "SERVICE", "DEADLINE", "STATUS"], agreements.map((agreement) => [agreement.id.toString(), truncateAddress(opts.as === "provider" ? agreement.client : agreement.provider), agreement.serviceType, formatDeadline(Number(agreement.deadline)), agreementStatusLabel(agreement.status)]));
  });
  program.command("agreement <id>").description("Show agreement detail, including remediation/dispute fields").option("--json").action(async (id, opts) => {
    const config = loadConfig(); if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
    const { provider } = await getClient(config); const client = new ServiceAgreementClient(config.serviceAgreementAddress, provider); const agreement = await client.getAgreement(BigInt(id));
    if (opts.json) return console.log(JSON.stringify(agreement, (_k, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    console.log(`agreement #${agreement.id}\nclient=${agreement.client}\nprovider=${agreement.provider}\nstatus=${agreementStatusLabel(agreement.status)}\ncreated=${formatDate(Number(agreement.createdAt))}\ndeadline=${formatDate(Number(agreement.deadline))}\nverifyWindowEnd=${Number(agreement.verifyWindowEnd) ? formatDate(Number(agreement.verifyWindowEnd)) : 'n/a'}\ncommittedHash=${agreement.committedHash}`);
    if ([AgreementStatus.REVISION_REQUESTED, AgreementStatus.REVISED, AgreementStatus.PARTIAL_SETTLEMENT, AgreementStatus.ESCALATED_TO_HUMAN, AgreementStatus.DISPUTED, AgreementStatus.ESCALATED_TO_ARBITRATION].includes(agreement.status)) {
      const remediation = await client.getRemediationCase(agreement.id); const dispute = await client.getDisputeCase(agreement.id);
      console.log(`remediationActive=${remediation.active} cycles=${remediation.cycleCount} disputeOutcome=${dispute.outcome}`);
    }
  });
}

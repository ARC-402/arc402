import type { AgreementListProps } from "./components/commerce/AgreementList";
import type { ComputeCardProps } from "./components/commerce/ComputeCard";
import type { DiscoverListProps } from "./components/commerce/DiscoverList";
import type { HireCardProps } from "./components/commerce/HireCard";
import type { RoundsListProps } from "./components/commerce/RoundsList";
import type { SquadCardProps } from "./components/commerce/SquadCard";
import type { StatusCardProps } from "./components/commerce/StatusCard";
import type { SubscribeCardProps } from "./components/commerce/SubscribeCard";
import type { WorkroomCardProps } from "./components/commerce/WorkroomCard";

function line(label: string, value: string): string {
  return `  ${label.padEnd(14)} ${value}`;
}

function printCard(eyebrow: string, title: string, subtitle?: string, status?: string, rows: string[] = [], footer?: string): void {
  console.log(`◈ ${eyebrow}`);
  console.log(status ? `${title}  ${status}` : title);
  if (subtitle) console.log(subtitle);
  console.log("─".repeat(60));
  for (const row of rows) console.log(row);
  if (footer) console.log(footer);
}

export async function printStatusCard(props: StatusCardProps): Promise<void> {
  printCard(
    "Wallet Status",
    props.wallet,
    props.network,
    props.status?.label,
    [
      line("balance", props.balance ?? "n/a"),
      line("endpoint", props.endpoint ?? "n/a"),
      ...(props.agreements ? [
        line("active", String(props.agreements.active)),
        line("verify", String(props.agreements.pendingVerification)),
        line("disputed", String(props.agreements.disputed)),
      ] : []),
      ...(props.workroom ? [line("workroom", props.workroom.status)] : []),
    ],
  );
}

export async function printDiscoverList(props: DiscoverListProps): Promise<void> {
  printCard(
    "Discover",
    props.title ?? "Discover Results",
    props.summary,
    props.status?.label,
    props.agents.flatMap((agent) => [
      `  #${agent.rank} ${agent.name} · ${agent.endpointStatus ?? "unknown"}`,
      `    ${agent.wallet}`,
      `    ${agent.serviceType} · trust ${agent.trustScore}${agent.priceLabel ? ` · ${agent.priceLabel}` : ""}${agent.capabilitySummary ? ` · ${agent.capabilitySummary}` : ""}`,
    ]),
    `${props.agents.length} ranked result${props.agents.length === 1 ? "" : "s"}`,
  );
}

export async function printHireCard(props: HireCardProps): Promise<void> {
  printCard(
    "Hire",
    props.providerName ? `${props.providerName} · ${props.providerAddress}` : props.providerAddress,
    props.capability,
    props.status?.label,
    [
      line("price", props.price),
      line("deadline", props.deadline ?? "open"),
      line("agreement", props.agreementId ?? "pending"),
      line("tx", props.txHash ?? "not submitted"),
      ...(props.notes ?? []).map((note) => `  • ${note}`),
    ],
  );
}

export async function printAgreementList(props: AgreementListProps): Promise<void> {
  printCard(
    "Agreements",
    props.roleLabel ?? "Recent Agreements",
    props.totalEscrowLabel,
    props.status?.label,
    props.agreements.flatMap((agreement) => [
      `  #${agreement.id} ${agreement.counterparty} · ${agreement.status}`,
      `    ${agreement.serviceType}${agreement.price ? ` · ${agreement.price}` : ""}${agreement.deadlineMinutes !== undefined ? ` · ${agreement.deadlineMinutes}m` : ""}`,
    ]),
  );
}

export async function printComputeCard(props: ComputeCardProps): Promise<void> {
  printCard(
    "Compute Session",
    props.sessionId,
    `${props.provider} · ${props.gpuSpec}`,
    props.status?.label,
    [
      line("rate", props.rateLabel),
      line("consumed", props.consumedLabel ?? "n/a"),
      line("cost", props.costLabel ?? "n/a"),
      line("remaining", props.remainingLabel ?? "n/a"),
      ...(props.utilizationPercent !== undefined ? [line("utilization", `${props.utilizationPercent.toFixed(2)}%`)] : []),
    ],
  );
}

export async function printSubscribeCard(props: SubscribeCardProps): Promise<void> {
  printCard(
    "Subscription",
    props.provider,
    props.planId,
    props.status?.label,
    [
      line("rate", props.rateLabel),
      line("months", String(props.months ?? 1)),
      line("renewal", props.nextRenewalLabel ?? "immediate access"),
      line("payments", props.paymentOptions?.join(", ") || "subscription"),
      ...(props.accessSummary ?? []).map((item) => `  • ${item}`),
    ],
  );
}

export async function printRoundsList(props: RoundsListProps): Promise<void> {
  printCard(
    "Arena",
    props.title ?? "Arena Rounds",
    undefined,
    props.status?.label,
    props.rounds.flatMap((round) => [
      `  #${round.id} ${round.question}`,
      `    ${round.category ?? "uncategorized"} · YES ${round.yesLabel} · NO ${round.noLabel} · ${round.timingLabel}${round.resolved ? ` · ${round.outcomeLabel ?? "resolved"}` : ""}`,
    ]),
    "Built for round boards and live resolution views.",
  );
}

export async function printSquadCard(props: SquadCardProps): Promise<void> {
  printCard(
    "Squad",
    props.name,
    props.id,
    props.status?.label ?? props.statusLabel,
    [
      line("domain", props.domainTag),
      line("members", String(props.memberCount)),
      line("invite", props.inviteOnly ? "yes" : "no"),
      line("creator", props.creator ?? "n/a"),
      ...(props.members ?? []).map((member) => `  • ${member.agent}${member.role ? ` · ${member.role}` : ""}${member.trustScore !== undefined ? ` · trust ${member.trustScore}` : ""}`),
      ...(props.briefings ?? []).map((briefing) => `  • ${briefing.preview}${briefing.publishedLabel ? ` · ${briefing.publishedLabel}` : ""}${briefing.tags?.length ? ` · ${briefing.tags.join(", ")}` : ""}`),
    ],
  );
}

export async function printWorkroomCard(props: WorkroomCardProps): Promise<void> {
  printCard(
    "Workroom",
    props.runtime ?? "Governed execution environment",
    undefined,
    props.status?.label ?? props.statusLabel,
    [
      line("harness", props.harness ?? "n/a"),
      line("queue", String(props.queueDepth ?? props.activeJobs?.length ?? 0)),
      line("policy", props.policyHash ?? "n/a"),
      ...(props.activeJobs ?? []).map((job) => `  • ${job.id} · ${job.status}${job.harness ? ` · ${job.harness}` : ""}${job.task ? ` · ${job.task}` : ""}`),
    ],
  );
}

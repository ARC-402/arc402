import type { ProfileCardProps } from "./components/commerce/ProfileCard";
import type { AgreementListProps } from "./components/commerce/AgreementList";
import type { ComputeCardProps } from "./components/commerce/ComputeCard";
import type { DiscoverListProps } from "./components/commerce/DiscoverList";
import type { FeedCardProps } from "./components/commerce/FeedCard";
import type { HireCardProps } from "./components/commerce/HireCard";
import type { JobStatusCardProps } from "./components/commerce/JobStatusCard";
import type { RoundsListProps } from "./components/commerce/RoundsList";
import type { SquadCardProps } from "./components/commerce/SquadCard";
import type { StandingsCardProps, StandingsEntry } from "./components/commerce/StandingsCard";
import type { StatusCardProps } from "./components/commerce/StatusCard";
import type { SubscribeCardProps } from "./components/commerce/SubscribeCard";
import type { WorkroomCardProps } from "./components/commerce/WorkroomCard";
import type { KernelPayload } from "./kernel-payload";
import { formatCountdown, formatPercent } from "./commerce-format";
import { writeTuiLine } from "./render-inline";

function emit(lines: string[]): void {
  for (const line of lines) writeTuiLine(line);
}

function separator(): string {
  return "─".repeat(60);
}

function badge(label?: string): string {
  return label ? `  ${label}` : "";
}

function detail(label: string, value: string): string {
  return `  ${label.padEnd(14)} ${value}`;
}

function bullet(value: string): string {
  return `  • ${value}`;
}

function listItem(title: string, meta?: string, detailLine?: string, status?: string): string[] {
  return [
    `${title}${badge(status)}`,
    ...(meta ? [meta] : []),
    ...(detailLine ? [detailLine] : []),
  ];
}

export function buildStatusCardLines(props: StatusCardProps, guidance?: string[]): string[] {
  return [
    "◈ Wallet Status",
    `${props.wallet}${badge(props.status?.label)}`,
    props.network,
    separator(),
    detail("balance", props.balance ?? "n/a"),
    detail("endpoint", props.endpoint ?? "n/a"),
    ...(typeof props.trustScore === "number"
      ? [detail("trust", formatPercent(Math.min(100, Math.max(0, props.trustScore / 5)), 1))]
      : []),
    ...(props.agreements
      ? [
          "",
          "agreements",
          detail("active", String(props.agreements.active)),
          detail("verify", String(props.agreements.pendingVerification)),
          detail("disputed", String(props.agreements.disputed)),
        ]
      : []),
    ...(props.workroom
      ? [
          "",
          "workroom",
          detail("status", props.workroom.status),
          detail("jobs", String(props.workroom.activeJobs ?? 0)),
          detail("harness", props.workroom.harness ?? "n/a"),
        ]
      : []),
    ...(guidance?.length ? ["", ...guidance] : []),
  ];
}

export function buildDiscoverListLines(props: DiscoverListProps): string[] {
  return [
    "◈ Discover",
    `${props.title ?? "Discover Results"}${badge(props.status?.label)}`,
    ...(props.summary ? [props.summary] : []),
    separator(),
    ...props.agents.flatMap((agent) =>
      listItem(
        `#${agent.rank} ${agent.name}`,
        `${agent.wallet} · trust ${agent.trustScore}${agent.priceLabel ? ` · ${agent.priceLabel}` : ""}`,
        `${agent.serviceType}${agent.capabilitySummary ? ` · ${agent.capabilitySummary}` : ""}${typeof agent.compositeScore === "number" ? ` · score ${formatPercent(agent.compositeScore * 100, 1)}` : ""}`,
        agent.endpointStatus,
      ).map((line) => `  ${line}`),
    ),
    `${props.agents.length} ranked result${props.agents.length === 1 ? "" : "s"}`,
  ];
}

export function buildHireCardLines(props: HireCardProps): string[] {
  return [
    "◈ Hire",
    `${props.providerName ? `${props.providerName} · ${props.providerAddress}` : props.providerAddress}${badge(props.status?.label)}`,
    props.capability,
    separator(),
    detail("price", props.price),
    detail("deadline", props.deadline ?? "open"),
    detail("agreement", props.agreementId ?? "pending"),
    detail("tx", props.txHash ?? "not submitted"),
    ...((props.notes ?? []).length > 0
      ? ["", "operator notes", ...(props.notes ?? []).map(bullet)]
      : []),
  ];
}

export function buildAgreementListLines(props: AgreementListProps): string[] {
  return [
    "◈ Agreements",
    `${props.roleLabel ?? "Recent Agreements"}${badge(props.status?.label)}`,
    ...(props.totalEscrowLabel ? [props.totalEscrowLabel] : []),
    separator(),
    ...(props.agreements.length > 0
      ? props.agreements.flatMap((agreement) =>
          listItem(
            `#${agreement.id} ${agreement.counterparty}`,
            `${agreement.serviceType}${agreement.price ? ` · ${agreement.price}` : ""}`,
            agreement.verifyWindowMinutes !== undefined
              ? `verify window ${formatCountdown(agreement.verifyWindowMinutes)}`
              : agreement.deadlineMinutes !== undefined
                ? `deadline ${formatCountdown(agreement.deadlineMinutes)}`
                : undefined,
            agreement.status,
          ).map((line) => `  ${line}`),
        )
      : ["  No agreements found."]),
  ];
}

export function buildComputeCardLines(props: ComputeCardProps): string[] {
  return [
    "◈ Compute Session",
    `${props.sessionId}${badge(props.status?.label)}`,
    `${props.provider} · ${props.gpuSpec}`,
    separator(),
    detail("rate", props.rateLabel),
    detail("consumed", props.consumedLabel ?? "n/a"),
    detail("cost", props.costLabel ?? "n/a"),
    detail("remaining", props.remainingLabel ?? "n/a"),
    ...(props.utilizationPercent !== undefined
      ? [detail("utilization", formatPercent(props.utilizationPercent, 2))]
      : []),
  ];
}

export function buildFeedCardLines(props: FeedCardProps): string[] {
  return [
    "◈ Arena Feed",
    props.title ?? "Arena Feed",
    separator(),
    ...(props.entries.length > 0
      ? props.entries.flatMap((entry) =>
          listItem(
            entry.eventType,
            `${entry.timestampLabel} · ${entry.agent}`,
            entry.summary,
            entry.eventType,
          ).map((line) => `  ${line}`),
        )
      : ["  No feed events found."]),
  ];
}

export function buildSubscribeCardLines(props: SubscribeCardProps): string[] {
  return [
    "◈ Subscription",
    `${props.provider}${badge(props.status?.label)}`,
    props.planId,
    separator(),
    detail("rate", props.rateLabel),
    detail("months", String(props.months ?? 1)),
    detail("renewal", props.nextRenewalLabel ?? "immediate access"),
    detail("payments", props.paymentOptions?.length ? props.paymentOptions.join(", ") : "subscription"),
    ...((props.accessSummary ?? []).length > 0
      ? ["", "access", ...(props.accessSummary ?? []).map(bullet)]
      : []),
  ];
}

export function buildRoundsListLines(props: RoundsListProps): string[] {
  return [
    "◈ Arena",
    `${props.title ?? "Arena Rounds"}${badge(props.status?.label)}`,
    separator(),
    ...(props.rounds.length > 0
      ? props.rounds.flatMap((round) =>
          listItem(
            `#${round.id} ${round.question}`,
            `${round.category ?? "uncategorized"} · ${round.timingLabel}`,
            `YES ${round.yesLabel} · NO ${round.noLabel}`,
            round.resolved ? (round.outcomeLabel ?? "resolved") : "open",
          ).map((line) => `  ${line}`),
        )
      : ["  No arena rounds found."]),
  ];
}

export function buildSquadCardLines(props: SquadCardProps): string[] {
  return [
    "◈ Squad",
    `${props.name}${badge(props.status?.label ?? props.statusLabel)}`,
    props.id,
    separator(),
    detail("domain", props.domainTag),
    detail("members", String(props.memberCount)),
    detail("invite", props.inviteOnly ? "yes" : "no"),
    detail("creator", props.creator ?? "n/a"),
    ...((props.members ?? []).length > 0
      ? ["", "members", ...(props.members ?? []).map((member) => bullet(`${member.agent}${member.role ? ` · ${member.role}` : ""}${member.trustScore !== undefined ? ` · trust ${member.trustScore}` : ""}`))]
      : []),
    ...((props.briefings ?? []).length > 0
      ? ["", "briefings", ...(props.briefings ?? []).map((briefing) => bullet(`${briefing.preview}${briefing.publishedLabel ? ` · ${briefing.publishedLabel}` : ""}${briefing.tags?.length ? ` · ${briefing.tags.join(", ")}` : ""}`))]
      : []),
  ];
}

export function buildJobStatusCardLines(props: JobStatusCardProps): string[] {
  return [
    "◈ Job Status",
    `Agreement #${props.agreementId}${badge(props.status?.label)}`,
    props.capability,
    separator(),
    detail("harness", props.harness ?? "n/a"),
    detail("pid", props.pid ?? "n/a"),
    detail("job dir", props.jobDir ?? "n/a"),
    detail("started", props.startedAt ?? "n/a"),
    detail("completed", props.completedAt ?? "n/a"),
    detail("exit", props.exitCode ?? "n/a"),
    detail("root hash", props.deliverableHash ?? "n/a"),
    ...(props.error ? [detail("error", props.error)] : []),
    ...((props.logTail ?? []).length > 0 ? ["", "log tail", ...(props.logTail ?? []).map((line) => `  ${line}`)] : []),
  ];
}

export function buildProfileCardLines(props: ProfileCardProps): string[] {
  return [
    "◈ Agent Profile",
    `${props.name ?? props.address}${badge(props.status?.label ?? (props.isActive ? "active" : "inactive"))}`,
    props.endpoint ?? "",
    separator(),
    detail("address", `${props.address.slice(0, 6)}…${props.address.slice(-4)}`),
    ...(props.serviceType ? [detail("service", props.serviceType)] : []),
    ...(typeof props.trustScore === "number" ? [detail("trust", String(props.trustScore))] : []),
    ...(typeof props.totalAgreements === "number"
      ? [detail("agreements", `${props.totalAgreements} completed · ${props.disputes ?? 0} disputes`)]
      : []),
    ...(props.capabilities?.length
      ? [
          "",
          "capabilities",
          ...props.capabilities.map(
            (c, i) => `  ${i === (props.capabilities?.length ?? 0) - 1 ? "└─" : "├─"} ${c}`,
          ),
        ]
      : []),
    ...(props.latestStatus ? [detail("latest", props.latestStatus)] : []),
  ];
}

export function buildStandingsLines(props: StandingsCardProps): string[] {
  return [
    "◈ Arena Standings",
    props.title ?? "Global Leaderboard",
    separator(),
    ...props.entries.map((e) => `  #${String(e.rank).padStart(2)} ${e.agent.padEnd(30)} ${String(e.wins).padStart(3)}W ${String(e.losses).padStart(3)}L  ${e.netUsdc} USDC`),
    `${props.entries.length} agents`,
  ];
}

export function buildWorkroomCardLines(props: WorkroomCardProps): string[] {
  return [
    "◈ Workroom",
    `${props.runtime ?? "Governed execution environment"}${badge(props.status?.label ?? props.statusLabel)}`,
    separator(),
    detail("harness", props.harness ?? "n/a"),
    detail("queue", String(props.queueDepth ?? props.activeJobs?.length ?? 0)),
    detail("policy", props.policyHash ?? "n/a"),
    ...((props.activeJobs ?? []).length > 0
      ? ["", "jobs", ...(props.activeJobs ?? []).map((job) => bullet(`${job.id} · ${job.status}${job.harness ? ` · ${job.harness}` : ""}${job.task ? ` · ${job.task}` : ""}`))]
      : []),
  ];
}

export function buildKernelPayloadLines(payload: KernelPayload): string[] {
  switch (payload.type) {
    case "status":
      return buildStatusCardLines(payload.props, payload.guidance);
    case "discover":
      return buildDiscoverListLines(payload.props);
    case "agreements":
      return buildAgreementListLines(payload.props);
    case "workroom":
      return buildWorkroomCardLines(payload.props);
    case "subscribe":
      return buildSubscribeCardLines(payload.props);
    case "rounds":
      return buildRoundsListLines(payload.props);
    case "squad":
      return buildSquadCardLines(payload.props);
    case "squads":
      return payload.cards.flatMap((card, index) => [
        ...buildSquadCardLines(card),
        ...(index < payload.cards.length - 1 ? [""] : []),
      ]);
    case "compute":
      return buildComputeCardLines(payload.props);
    case "computes":
      return payload.cards.flatMap((card, index) => [
        ...buildComputeCardLines(card),
        ...(index < payload.cards.length - 1 ? [""] : []),
      ]);
    case "feed":
      return buildFeedCardLines(payload.props);
    case "job":
      return buildJobStatusCardLines(payload.props);
    case "profile":
      return buildProfileCardLines(payload.props);
    case "standings":
      return buildStandingsLines(payload.props);
    case "not_found":
    case "error":
      return [payload.message];
  }
}

export async function printStatusCard(props: StatusCardProps): Promise<void> {
  emit(buildStatusCardLines(props));
}

export async function printDiscoverList(props: DiscoverListProps): Promise<void> {
  emit(buildDiscoverListLines(props));
}

export async function printHireCard(props: HireCardProps): Promise<void> {
  emit(buildHireCardLines(props));
}

export async function printAgreementList(props: AgreementListProps): Promise<void> {
  emit(buildAgreementListLines(props));
}

export async function printComputeCard(props: ComputeCardProps): Promise<void> {
  emit(buildComputeCardLines(props));
}

export async function printSubscribeCard(props: SubscribeCardProps): Promise<void> {
  emit(buildSubscribeCardLines(props));
}

export async function printRoundsList(props: RoundsListProps): Promise<void> {
  emit(buildRoundsListLines(props));
}

export async function printSquadCard(props: SquadCardProps): Promise<void> {
  emit(buildSquadCardLines(props));
}

export async function printJobStatusCard(props: JobStatusCardProps): Promise<void> {
  emit(buildJobStatusCardLines(props));
}

export async function printProfileCard(props: ProfileCardProps): Promise<void> {
  emit(buildProfileCardLines(props));
}

export async function printStandings(props: StandingsCardProps): Promise<void> {
  emit(buildStandingsLines(props));
}

export async function printWorkroomCard(props: WorkroomCardProps): Promise<void> {
  emit(buildWorkroomCardLines(props));
}

import chalk from "chalk";

export interface ArenaRoundViewModel {
  id: string;
  question: string;
  category?: string;
  yesPot: bigint;
  noPot: bigint;
  stakingClosesAt?: number;
  resolvesAt?: number;
  resolved: boolean;
  outcome?: boolean;
}

export interface ArenaSquadMemberViewModel {
  agent: string;
  role: string;
  isLead?: boolean;
}

export interface ArenaBriefingViewModel {
  preview: string;
  publishedAt?: number;
  tags?: string[];
}

export interface ArenaSquadViewModel {
  id: string;
  name: string;
  domainTag?: string;
  creator: string;
  status: string;
  inviteOnly?: boolean;
  memberCount: number;
  createdAt?: number;
  members: ArenaSquadMemberViewModel[];
  briefings: ArenaBriefingViewModel[];
}

function sectionHeading(title: string): string {
  const ruleWidth = Math.max(8, 44 - title.length);
  return `${chalk.cyanBright("◈")} ${chalk.bold(title)} ${chalk.dim("─".repeat(ruleWidth))}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function formatUsdc(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  const fracText = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fracText || "0"} USDC`;
}

function formatRelative(ts?: number): string {
  if (!ts || Number.isNaN(ts)) return "unknown";

  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${Math.max(diff, 0)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatRemaining(ts?: number): string {
  if (!ts || Number.isNaN(ts)) return "schedule unknown";

  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "closed";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

function roleLabel(role: string): string {
  switch (role) {
    case "0":
      return "lead";
    case "1":
      return "member";
    case "2":
      return "reviewer";
    default:
      return role;
  }
}

export function renderRoundsList(
  rounds: ArenaRoundViewModel[],
  title = "Arena Rounds",
): string {
  const lines: string[] = ["", sectionHeading(title), ""];

  if (rounds.length === 0) {
    lines.push(`  ${chalk.dim("No rounds found.")}`, "");
    return lines.join("\n");
  }

  let firstJoinableId: string | null = null;

  for (const round of rounds) {
    const totalPot = round.yesPot + round.noPot;
    const yesPct = totalPot > 0n ? Number((round.yesPot * 10000n) / totalPot) / 100 : 50;
    const noPct = totalPot > 0n ? Number((round.noPot * 10000n) / totalPot) / 100 : 50;

    if (!round.resolved && firstJoinableId === null) {
      firstJoinableId = round.id;
    }

    if (round.resolved) {
      const outcome = round.outcome ? chalk.green("YES ✓") : chalk.red("NO ✓");
      lines.push(
        `  ${chalk.bold(`#${round.id}`)}  ${chalk.bold(truncate(round.question, 46))}  ${chalk.dim(formatRelative(round.resolvesAt))}`,
        `       ${chalk.dim("RESOLVED")} ${outcome} · ${chalk.dim(round.category ?? "uncategorized")}`,
        `       ${chalk.dim(`Winner payout: ${formatUsdc(totalPot)} distributed`)}`,
      );
      lines.push("");
      continue;
    }

    const timeLabel = round.stakingClosesAt
      ? `${formatRemaining(round.stakingClosesAt)} left`
      : round.resolvesAt
        ? `resolves in ${formatRemaining(round.resolvesAt)}`
        : "open";

    lines.push(
      `  ${chalk.bold(`#${round.id}`)}  ${chalk.bold(truncate(round.question, 46))}  ${chalk.yellow(timeLabel)}`,
      `       ${chalk.green(`YES ${yesPct.toFixed(1)}%`)} (${formatUsdc(round.yesPot)}) · ${chalk.red(`NO ${noPct.toFixed(1)}%`)} (${formatUsdc(round.noPot)})`,
      `       ${chalk.dim(round.category ?? "uncategorized")}${round.resolvesAt ? chalk.dim(` · resolves ${formatRelative(round.resolvesAt)}`) : ""}`,
    );
    lines.push("");
  }

  if (firstJoinableId) {
    lines.push(`  ${chalk.dim(`arc402 arena join ${firstJoinableId} --side yes --amount 0.1`)}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderSquadCard(squad: ArenaSquadViewModel): string {
  const lines: string[] = [
    "",
    sectionHeading(`Squad: ${squad.name}`),
    "",
    `  ${chalk.dim("ID".padEnd(10))}${squad.id}`,
    `  ${chalk.dim("Domain".padEnd(10))}${squad.domainTag ?? "—"}`,
    `  ${chalk.dim("Lead".padEnd(10))}${squad.members.find((member) => member.isLead)?.agent ?? squad.creator}`,
    `  ${chalk.dim("Status".padEnd(10))}${squad.status}${squad.inviteOnly ? chalk.dim(" · invite-only") : ""}`,
    `  ${chalk.dim("Members".padEnd(10))}${squad.memberCount} active`,
  ];

  if (squad.createdAt) {
    lines.push(`  ${chalk.dim("Created".padEnd(10))}${formatRelative(squad.createdAt)}`);
  }

  if (squad.members.length > 0) {
    lines.push("", `  ${chalk.bold("Members")}`);
    squad.members.forEach((member, index) => {
      const connector = index === squad.members.length - 1 ? "└" : "├";
      const role = member.isLead ? "lead" : roleLabel(member.role);
      lines.push(`  ${chalk.dim(connector)} ${truncate(member.agent, 20)}  ${chalk.dim(role)}`);
    });
  }

  if (squad.briefings.length > 0) {
    lines.push("", `  ${chalk.bold("Briefings")}`);
    squad.briefings.slice(0, 4).forEach((briefing, index) => {
      const connector = index === Math.min(squad.briefings.length, 4) - 1 ? "└" : "├";
      const tagText = briefing.tags && briefing.tags.length > 0
        ? ` · ${briefing.tags.join(", ")}`
        : "";
      lines.push(
        `  ${chalk.dim(connector)} ${truncate(briefing.preview, 52)}${briefing.publishedAt ? chalk.dim(` · ${formatRelative(briefing.publishedAt)}`) : ""}${chalk.dim(tagText)}`,
      );
    });
  } else {
    lines.push("", `  ${chalk.dim("No published briefings yet.")}`);
  }

  lines.push(
    "",
    `  ${chalk.dim(`arc402 arena briefing list ${squad.id}`)}`,
    `  ${chalk.dim(`arc402 arena squad contribute ${squad.id} --hash <bytes32> --description "..."`)}`,
    "",
  );

  return lines.join("\n");
}

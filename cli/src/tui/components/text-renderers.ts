import { ethers } from "ethers";
import { c } from "../../ui/colors";
import type { AgreementListProps, AgreementState } from "./AgreementList";
import type { ComputeCardProps, ComputeMetric, ComputeUsageSummary } from "./ComputeCard";
import type { StatusCardProps } from "./StatusCard";

const AGREEMENT_SYMBOLS: Record<AgreementState, string> = {
  ACTIVE: c.cyan("◉"),
  PROPOSED: c.yellow("⚠"),
  ACCEPTED: c.cyan("◈"),
  PENDING_VERIFICATION: c.yellow("···"),
  DELIVERED: c.yellow("⚠"),
  FULFILLED: c.green("✓"),
  DISPUTED: c.red("✗"),
  UNKNOWN: c.white("─"),
};

function truncateMiddle(value: string, start = 10, end = 6): string {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function renderProgressBar(percentUsed = 0): string {
  const clamped = Math.max(0, Math.min(100, percentUsed));
  const filled = Math.round((clamped / 100) * 32);
  return `${"█".repeat(filled)}${"░".repeat(32 - filled)}  ${clamped.toFixed(1)}%`;
}

function renderMetricTree(metrics: ComputeMetric[]): string[] {
  return metrics.map((metric, index) => {
    const branch = index === metrics.length - 1 ? "└" : "├";
    return `  ${c.dim(branch)} ${c.dim(metric.label.padEnd(12))} ${c.white(metric.value)}`;
  });
}

function renderUsageTree(usage: ComputeUsageSummary): string[] {
  const lines = [
    `${c.cyan("Usage:")}`,
    `  ${c.dim("├")} ${c.dim("Consumed".padEnd(12))} ${c.white(usage.consumed)}`,
    `  ${c.dim("├")} ${c.dim("Cost so far".padEnd(12))} ${c.white(usage.cost)}`,
  ];
  const remaining = usage.escrowCeiling
    ? `${usage.remaining} ${c.dim(`(${usage.escrowCeiling})`)}`
    : usage.remaining;
  lines.push(`  ${c.dim("└")} ${c.dim("Remaining".padEnd(12))} ${c.white(remaining)}`);
  if (usage.percentUsed !== undefined) {
    lines.push("");
    lines.push(`  ${c.cyan(renderProgressBar(usage.percentUsed))}`);
  }
  return lines;
}

export function renderStatusCardText({
  network,
  wallet,
  balance,
  agreements,
}: StatusCardProps): string[] {
  if (!network && !wallet && !balance && agreements === undefined) {
    return [c.dim("No config found. Run 'config init' to get started.")];
  }

  const lines = [` ${c.mark} ${c.white("Status")}`];
  if (network) lines.push(`  ${c.dim("Network".padEnd(12))} ${c.white(network)}`);
  if (wallet) lines.push(`  ${c.dim("Wallet".padEnd(12))} ${c.white(wallet)}`);
  if (balance) lines.push(`  ${c.dim("Balance".padEnd(12))} ${c.white(balance)}`);
  if (agreements !== undefined) lines.push(`  ${c.dim("Agreements".padEnd(12))} ${c.white(String(agreements))}`);
  return lines;
}

export function renderAgreementListText({
  agreements,
  title = "Your Agreements",
  summary,
  actionHints = [],
}: AgreementListProps): string[] {
  const lines = [` ${c.mark} ${c.white(title)}`];

  if (agreements.length === 0) {
    lines.push("");
    lines.push(`  ${c.dim("No agreements found.")}`);
    return lines;
  }

  lines.push("");
  for (const agreement of agreements) {
    const symbol = AGREEMENT_SYMBOLS[agreement.state] ?? c.white("─");
    const row = [
      `#${agreement.id}`,
      `${symbol} ${pad(agreement.state, 22)}`,
      pad(agreement.counterparty, 16),
      pad(agreement.value, 14),
      agreement.timestamp ?? "",
    ]
      .filter(Boolean)
      .join("  ");
    lines.push(`  ${row}`);
  }

  if (summary) {
    lines.push("");
    lines.push(`  ${c.dim(summary)}`);
  }

  if (actionHints.length > 0) {
    lines.push("");
    actionHints.forEach((hint) => lines.push(`  ${c.dim(hint)}`));
  }

  return lines;
}

export function renderComputeCardText({
  title = "Compute Session",
  sessionId,
  provider,
  gpuSpec,
  rate,
  started,
  status,
  usage,
  metrics = [],
  footerHints = [],
}: ComputeCardProps): string[] {
  const lines = [` ${c.mark} ${c.white(title)}`, ""];
  lines.push(`  ${c.dim("Session".padEnd(12))} ${c.white(truncateMiddle(sessionId))}`);
  lines.push(`  ${c.dim("Provider".padEnd(12))} ${c.white(provider)}`);
  if (gpuSpec) lines.push(`  ${c.dim("GPU".padEnd(12))} ${c.white(gpuSpec)}`);
  lines.push(`  ${c.dim("Rate".padEnd(12))} ${c.white(rate)}`);
  if (started) lines.push(`  ${c.dim("Started".padEnd(12))} ${c.white(started)}`);
  if (status) lines.push(`  ${c.dim("Status".padEnd(12))} ${c.white(status)}`);

  if (usage) {
    lines.push("");
    lines.push(...renderUsageTree(usage));
  }

  if (metrics.length > 0) {
    lines.push("");
    lines.push(c.cyan("Current metrics:"));
    lines.push(...renderMetricTree(metrics));
  }

  if (footerHints.length > 0) {
    lines.push("");
    footerHints.forEach((hint) => lines.push(`  ${c.dim(hint)}`));
  }

  return lines;
}

export function formatDurationFromMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, totalMinutes);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatUnixAge(timestamp: number | null | undefined): string | undefined {
  if (!timestamp) return undefined;
  const deltaSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const hours = Math.floor(deltaSeconds / 3600);
  const minutes = Math.floor((deltaSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${deltaSeconds}s ago`;
}

export function formatEthAmount(wei: bigint): string {
  return `${Number(ethers.formatEther(wei)).toFixed(4)} ETH`;
}

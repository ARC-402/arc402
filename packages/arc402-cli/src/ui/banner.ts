import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

function readVersion(): string {
  try {
    // Works in both CJS and ESM contexts
    const pkgPath = path.resolve(__dirname ?? "", "../../package.json");
    return (JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

const _pkg = { version: readVersion() };

const LARGE_ART = [
  " ██████╗ ██████╗  ██████╗      ██╗  ██╗ ██████╗ ██████╗",
  " ██╔══██╗██╔══██╗██╔════╝      ██║  ██║██╔═══██╗╚════██╗",
  " ███████║██████╔╝██║     █████╗███████║██║   ██║ █████╔╝",
  " ██╔══██║██╔══██╗██║     ╚════╝╚════██║██║   ██║██╔═══╝",
  " ██║  ██║██║  ██║╚██████╗           ██║╚██████╔╝███████╗",
  " ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝           ╚═╝ ╚═════╝ ╚══════╝",
] as const;

const MEDIUM_MARK = [
  " ARC-402",
  " agent-to-agent commerce",
] as const;

const SMALL_MARK = [" ARC-402"] as const;

export interface BannerConfig {
  network?: string;
  wallet?: string;
  balance?: string;
  width?: number;
}

interface BannerVariant {
  artLines: readonly string[];
  compactMeta: boolean;
}

function visibleLength(value: string): number {
  return value.replace(/\u001B\[[0-9;]*m/g, "").length;
}

function pickVariant(width: number): BannerVariant {
  const largeWidth = LARGE_ART.reduce((max, line) => Math.max(max, line.length), 0);
  if (width >= largeWidth + 2) {
    return { artLines: LARGE_ART, compactMeta: false };
  }
  if (width >= 32) {
    return { artLines: MEDIUM_MARK, compactMeta: false };
  }
  return { artLines: SMALL_MARK, compactMeta: true };
}

/** Returns banner as an array of plain lines (no trailing newlines). */
export function getBannerLines(config?: BannerConfig): string[] {
  const width = Math.max(20, config?.width ?? process.stdout?.columns ?? 80);
  const { artLines, compactMeta } = pickVariant(width);
  const lines: string[] = [];

  for (const line of artLines) {
    lines.push(chalk.cyan(line));
  }

  lines.push("");

  const versionLine = compactMeta
    ? ` ${chalk.dim(`v${_pkg.version}`)}`
    : ` ${chalk.dim(`agent-to-agent arcing · v${_pkg.version}`)}`;
  lines.push(versionLine);

  const separatorWidth = Math.max(12, Math.min(45, width - 4));
  lines.push(` ${chalk.cyanBright("◈")} ${chalk.dim("─".repeat(separatorWidth))}`);

  const metaLines: string[] = [];
  if (config?.network) metaLines.push(` ${chalk.dim("Network")}   ${chalk.white(config.network)}`);
  if (config?.wallet) metaLines.push(` ${chalk.dim("Wallet")}    ${chalk.white(config.wallet)}`);
  if (config?.balance) metaLines.push(` ${chalk.dim("Balance")}   ${chalk.white(config.balance)}`);

  if (metaLines.length > 0) {
    lines.push("");
    const available = Math.max(10, width - 2);
    for (const line of metaLines) {
      if (visibleLength(line) <= available) {
        lines.push(line);
        continue;
      }

      const [labelPart, valuePart = ""] = line.split(/\s{2,}/, 2);
      lines.push(labelPart);
      lines.push(`   ${valuePart.trim()}`);
    }
  }

  lines.push("");
  lines.push(` ${chalk.dim("Type 'help' to get started")}`);
  lines.push("");
  return lines;
}

export function renderBanner(config?: BannerConfig): void {
  for (const line of getBannerLines(config)) {
    console.log(line);
  }
}

import chalk from "chalk";

// ─── ARC-402 Color System ─────────────────────────────────────────────────────

export const c = {
  // Protocol mark + section headings
  cyan: chalk.cyan,
  brightCyan: chalk.cyanBright,

  // Primary content, values
  white: chalk.white,

  // Secondary info — addresses, timestamps, labels
  dim: chalk.dim,

  // Success states, fulfilled agreements
  green: chalk.green,

  // Errors, disputes, failures
  red: chalk.red,

  // Warnings, pending states, unconfirmed
  yellow: chalk.yellow,

  // Symbols
  mark: chalk.cyanBright("◈"),
  success: chalk.green("✓"),
  failure: chalk.red("✗"),
  warning: chalk.yellow("⚠"),
};

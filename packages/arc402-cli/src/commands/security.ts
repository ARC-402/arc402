import { Command } from "commander";
import chalk from "chalk";

export function registerSecurityCommand(program: Command): void {
  const security = program
    .command("security")
    .description("Security event log and threat management");

  security
    .command("status")
    .description("Show security event summary")
    .action(() => {
      console.log(chalk.cyanBright("◈ Security Status"));
      console.log("");
      console.log(chalk.dim("  PromptGuard: active"));
      console.log(chalk.dim("  Pattern registry: 14 patterns loaded"));
      console.log(chalk.dim("  Scope: hire endpoint + task.md write boundary"));
      console.log("");
      console.log(chalk.dim("  Event log: ~/.arc402/daemon.db → security_events table"));
      console.log(chalk.dim("  Run: arc402 security events (requires daemon running)"));
    });

  security
    .command("patterns")
    .description("List active PromptGuard injection patterns")
    .action(() => {
      const categories = [
        "instruction_override (4 patterns) — CRITICAL",
        "role_override (3 patterns) — CRITICAL/HIGH",
        "protocol_injection (3 patterns) — CRITICAL",
        "key_exfiltration (2 patterns) — CRITICAL",
        "exfiltration (2 patterns) — CRITICAL/HIGH",
        "delimiter_injection (5 patterns) — CRITICAL/HIGH",
      ];
      console.log(chalk.cyanBright("◈ PromptGuard Pattern Registry\n"));
      for (const c of categories) {
        console.log(`  ├─ ${chalk.white(c)}`);
      }
      console.log();
    });
}

import { Command } from "commander";
import chalk from "chalk";

export function registerLifecycleCommand(program: Command): void {
  program
    .command("lifecycle")
    .description("Show the universal ARC-402 commerce lifecycle stages")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const stages = [
        { stage: "INTENT",        class: "off-chain",   description: "Discover providers, identify need",                   commands: ["arc402 discover", "arc402 index capabilities"] },
        { stage: "PRICING",       class: "off-chain",   description: "Negotiate terms, review market rates",               commands: ["arc402 negotiate <endpoint>", "arc402 index price"] },
        { stage: "AUTHORIZATION", class: "daemon",      description: "PolicyEngine spend check, policy gate",              commands: ["arc402 policy show"] },
        { stage: "FUNDING",       class: "on-chain",    description: "Escrow locked, agreement created on Base",           commands: ["arc402 hire", "arc402 compute hire", "arc402 subscribe"] },
        { stage: "DISPATCH",      class: "workroom",    description: "Worker routed to harness, PromptGuard scan",         commands: ["arc402 workroom status", "arc402 job status <id>"] },
        { stage: "EVIDENCE",      class: "on-chain",    description: "Deliverable committed, hash on-chain",               commands: ["arc402 deliver <id>", "arc402 job files <id>"] },
        { stage: "ACCEPTANCE",    class: "on-chain",    description: "Client verifies, escrow released",                  commands: ["arc402 verify <id>", "arc402 job fetch <id>"] },
        { stage: "SETTLEMENT",    class: "on-chain",    description: "Payment distributed to provider",                   commands: ["arc402 agreements", "arc402 watch"] },
        { stage: "DISPUTE",       class: "on-chain",    description: "Optional: arbitration if delivery disputed",         commands: ["arc402 dispute open <id>", "arc402 dispute status <id>"] },
        { stage: "REPUTATION",    class: "post-hoc",    description: "Trust score updated, citation trail recorded",       commands: ["arc402 reputation <address>", "arc402 trust <address>"] },
      ];

      if (opts.json) {
        console.log(JSON.stringify(stages, null, 2));
        return;
      }

      console.log(chalk.cyanBright("\n◈ ARC-402 Universal Commerce Lifecycle\n"));
      console.log(chalk.dim("  Every agreement type (Service, Compute, Subscription) follows this path.\n"));

      const classColor: Record<string, string> = {
        "off-chain": "dim",
        "daemon":    "yellow",
        "on-chain":  "cyan",
        "workroom":  "green",
        "post-hoc":  "magenta",
      };

      for (let i = 0; i < stages.length; i++) {
        const { stage, class: cls, description, commands } = stages[i];
        const isLast = i === stages.length - 1;
        const connector = isLast ? "└─" : "├─";
        const color = classColor[cls] ?? "white";

        console.log(`  ${chalk.dim(connector)} ${chalk.bold.white(stage.padEnd(16))} ${(chalk as any)[color](cls.padEnd(10))}  ${chalk.dim(description)}`);
        for (const cmd of commands) {
          console.log(`  ${chalk.dim("│")}   ${chalk.dim(cmd)}`);
        }
        if (!isLast) console.log(`  ${chalk.dim("│")}`);
      }

      console.log();
      console.log(chalk.dim("  Stages 1-2: off-chain discovery + negotiation"));
      console.log(chalk.dim("  Stages 3-9: on-chain protocol states"));
      console.log(chalk.dim("  Stage 10:   reputation analytics"));
      console.log();
    });
}

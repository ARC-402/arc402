import { Command } from "commander";
import chalk from "chalk";
import {
  buildNewsletterAccessMessage,
  fetchNewsletterIssue,
  inspectCommerceEndpoint,
} from "../commerce-client";
import { isTuiRenderMode } from "../tui/render-inline";
import { printSubscribeCard } from "../tui/command-renderers";

interface JsonCapableOptions {
  json?: boolean;
}

function outputScaffold(
  action: string,
  payload: Record<string, unknown>,
  opts: JsonCapableOptions
): void {
  const response = {
    action,
    phase: "Phase 4C scaffold",
    status: "direction-set",
    ...payload,
  };

  if (opts.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  console.log(chalk.bold(`◈ ${action}`));
  console.log("");
  for (const [key, value] of Object.entries(response)) {
    console.log(`  ${key.padEnd(16)} ${String(value)}`);
  }
}

export function registerSubscriptionCommands(program: Command): void {
  program
    .command("subscribe")
    .description("Inspect a commerce endpoint and stage a SubscriptionAgreement intent")
    .argument("<endpoint>", "Endpoint that may expose x402/subscription headers")
    .option("--plan <id>", "Desired plan identifier")
    .option("--months <n>", "Requested subscription duration", "1")
    .option("--json", "Output as JSON")
    .action(async (endpoint, opts) => {
      const inspection = await inspectCommerceEndpoint(endpoint);
      if (!opts.json && isTuiRenderMode()) {
        await printSubscribeCard({
          provider: endpoint,
          planId: opts.plan ?? inspection.subscription?.plan ?? "unspecified",
          rateLabel: inspection.subscription?.rate ?? inspection.x402?.amount ?? "n/a",
          months: Number.parseInt(opts.months as string, 10),
          paymentOptions: inspection.paymentOptions,
          accessSummary: [inspection.subscription?.endpoint ?? endpoint, inspection.x402?.description ?? "read-only scaffold"],
          status: { label: inspection.paymentRequired ? "payment required" : "inspect", tone: inspection.paymentRequired ? "warning" : "info" },
        });
        return;
      }
      outputScaffold(
        "Subscribe",
        {
          endpoint,
          requestedPlan: opts.plan ?? inspection.subscription?.plan ?? "unspecified",
          months: Number.parseInt(opts.months as string, 10),
          paymentOptions: inspection.paymentOptions.join(", ") || "none advertised",
          x402Amount: inspection.x402?.amount ?? "n/a",
          subscriptionRate: inspection.subscription?.rate ?? "n/a",
          note: "Read-only scaffolding. On-chain subscribe flow still needs contract write wiring.",
        },
        opts as JsonCapableOptions
      );
    });

  const subscription = program
    .command("subscription")
    .description("SubscriptionAgreement lifecycle scaffolding (Spec 46 §7)");

  subscription
    .command("status")
    .argument("<id>", "Subscription id")
    .option("--json", "Output as JSON")
    .action(async (id, opts) => {
      if (!opts.json && isTuiRenderMode()) {
        await printSubscribeCard({
          provider: `subscription ${id}`,
          planId: "status",
          rateLabel: "pending query binding",
          accessSummary: ["Contract/subgraph lookup pending"],
          status: { label: "scaffold", tone: "warning" },
        });
        return;
      }
      outputScaffold("Subscription Status", { id, note: "Status lookup contract/subgraph binding pending." }, opts as JsonCapableOptions);
    });

  subscription
    .command("list")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      if (!opts.json && isTuiRenderMode()) {
        await printSubscribeCard({
          provider: "subscriptions",
          planId: "list",
          rateLabel: "query source pending",
          accessSummary: ["List query scaffolding only"],
          status: { label: "scaffold", tone: "warning" },
        });
        return;
      }
      outputScaffold("Subscription List", { note: "List query scaffolding only. No implicit storage contract assumed." }, opts as JsonCapableOptions);
    });

  subscription
    .command("cancel")
    .argument("<id>", "Subscription id")
    .option("--json", "Output as JSON")
    .action(async (id, opts) => {
      if (!opts.json && isTuiRenderMode()) {
        await printSubscribeCard({
          provider: `subscription ${id}`,
          planId: "cancel",
          rateLabel: "write path deferred",
          accessSummary: ["Cancellation intentionally not wired in this phase"],
          status: { label: "deferred", tone: "warning" },
        });
        return;
      }
      outputScaffold("Subscription Cancel", { id, note: "Cancellation write path intentionally not wired in this phase." }, opts as JsonCapableOptions);
    });

  subscription
    .command("topup")
    .argument("<id>", "Subscription id")
    .requiredOption("--months <n>", "Additional months to purchase")
    .option("--json", "Output as JSON")
    .action(async (id, opts) => {
      if (!opts.json && isTuiRenderMode()) {
        await printSubscribeCard({
          provider: `subscription ${id}`,
          planId: "topup",
          rateLabel: `+${opts.months} months`,
          months: Number.parseInt(opts.months as string, 10),
          accessSummary: ["Top-up command shape is staged"],
          status: { label: "scaffold", tone: "warning" },
        });
        return;
      }
      outputScaffold(
        "Subscription Topup",
        {
          id,
          months: Number.parseInt(opts.months as string, 10),
          note: "Top-up command shape is in place; funding flow remains to be connected.",
        },
        opts as JsonCapableOptions
      );
    });

  const plan = program
    .command("plan")
    .description("Provider-side subscription plan scaffolding (Spec 46 §7)");

  plan
    .command("create")
    .requiredOption("--plan-id <id>", "Plan identifier")
    .requiredOption("--rate <ethPerMonth>", "Monthly rate in ETH")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      outputScaffold(
        "Plan Create",
        {
          planId: opts.planId,
          rate: opts.rate,
          note: "Create command is staged for a future SubscriptionAgreement write adapter.",
        },
        opts as JsonCapableOptions
      );
    });

  plan
    .command("list")
    .argument("[endpoint]", "Optional endpoint to inspect for advertised plan headers")
    .option("--json", "Output as JSON")
    .action(async (endpoint, opts) => {
      if (endpoint) {
        const inspection = await inspectCommerceEndpoint(endpoint);
        outputScaffold(
          "Plan List",
          {
            endpoint,
            advertisedPlan: inspection.subscription?.plan ?? "n/a",
            advertisedRate: inspection.subscription?.rate ?? "n/a",
            paymentOptions: inspection.paymentOptions.join(", ") || "none advertised",
          },
          opts as JsonCapableOptions
        );
        return;
      }

      outputScaffold("Plan List", { note: "Provider plan listing requires a concrete storage/query source." }, opts as JsonCapableOptions);
    });

  const x402 = program
    .command("x402")
    .description("x402 bridge inspection helpers (Spec 46 §7)");

  x402
    .command("inspect")
    .argument("<url>", "HTTP endpoint expected to emit 402 payment headers")
    .option("--json", "Output as JSON")
    .action(async (url, opts) => {
      const inspection = await inspectCommerceEndpoint(url);

      if (opts.json) {
        console.log(JSON.stringify(inspection, null, 2));
        return;
      }

      console.log(chalk.bold("◈ x402 Inspect"));
      console.log("");
      console.log(`  ${"url".padEnd(16)} ${inspection.url}`);
      console.log(`  ${"status".padEnd(16)} ${inspection.status}`);
      console.log(`  ${"paymentRequired".padEnd(16)} ${inspection.paymentRequired}`);
      console.log(`  ${"options".padEnd(16)} ${inspection.paymentOptions.join(", ") || "none"}`);
      console.log(`  ${"receiver".padEnd(16)} ${inspection.x402?.receiver ?? "n/a"}`);
      console.log(`  ${"amount".padEnd(16)} ${inspection.x402?.amount ?? "n/a"}`);
      console.log(`  ${"subscription".padEnd(16)} ${inspection.subscription?.plan ?? "n/a"}`);
    });

  x402
    .command("issue")
    .description("Fetch a newsletter issue and surface typed x402/subscription responses")
    .requiredOption("--base-url <url>", "Daemon base URL")
    .requiredOption("--newsletter <id>", "Newsletter id")
    .requiredOption("--issue <hash>", "Issue content hash")
    .option("--signer <address>", "Subscriber wallet")
    .option("--signature <sig>", "EIP-191 signature for the issue access message")
    .option("--api-token <token>", "Daemon bearer token for local automation")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const result = await fetchNewsletterIssue(
        opts.baseUrl as string,
        opts.newsletter as string,
        opts.issue as string,
        {
          signer: opts.signer as string | undefined,
          signature: opts.signature as string | undefined,
          apiToken: opts.apiToken as string | undefined,
        }
      );

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              ...result,
              accessMessage: buildNewsletterAccessMessage(opts.newsletter as string, opts.issue as string),
            },
            null,
            2
          )
        );
        return;
      }

      console.log(chalk.bold("◈ x402 Issue Fetch"));
      console.log("");
      console.log(`  ${"status".padEnd(16)} ${result.status}`);
      console.log(`  ${"contentType".padEnd(16)} ${result.contentType ?? "n/a"}`);
      console.log(`  ${"paymentRequired".padEnd(16)} ${result.paymentRequired}`);
      console.log(`  ${"plan".padEnd(16)} ${result.subscription?.plan ?? "n/a"}`);
      console.log(`  ${"amount".padEnd(16)} ${result.x402?.amount ?? "n/a"}`);
      console.log(`  ${"signMessage".padEnd(16)} ${buildNewsletterAccessMessage(opts.newsletter as string, opts.issue as string)}`);
      if (result.body) {
        console.log("");
        console.log(result.body);
      }
    });
}

/**
 * arc402 compute — CLI commands for GPU compute rental.
 *
 * Subcommands:
 *   offer      Register as a GPU provider (set spec + rate in daemon.toml)
 *   discover   Find GPU providers (queries relay / registry)
 *   hire       Propose a compute session to a provider
 *   status     Check metrics for a running session
 *   end        End a compute session
 *   sessions   List all sessions on this node
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import { ethers } from "ethers";
import { DAEMON_DIR, DAEMON_TOML } from "../daemon/config";
import { loadConfig, NETWORK_DEFAULTS } from "../config";
import { requireSigner } from "../client";
import { printSenderInfo, executeContractWriteViaWallet } from "../wallet-router";
import { COMPUTE_AGREEMENT_ABI, AGENT_REGISTRY_ABI } from "../abis";
import { startSpinner } from "../ui/spinner";
import { renderTree } from "../ui/tree";
import chalk from "chalk";
import { c } from "../ui/colors";
import { renderComputeCardText, formatDurationFromMinutes, formatEthAmount, formatUnixAge } from "../tui/components/text-renderers";
import type { ComputeMetric, ComputeUsageSummary } from "../tui/components/ComputeCard";

const bold = chalk.bold;

interface ComputeProposalView {
  sessionId: string;
  clientAddress: string;
  providerAddress?: string;
  token?: string;
  ratePerHourWei: string;
  maxHours: number;
  gpuSpecHash: string;
  workloadDescription: string;
  depositAmount: string;
  proposedAt?: number;
}

interface ComputeSessionView {
  proposal: ComputeProposalView;
  status: string;
  startedAt: number | null;
  endedAt: number | null;
  consumedMinutes: number;
}

interface CurrentComputeMetrics {
  gpuUtilizationPercent?: number;
  gpuMemoryUsedMB?: number;
  gpuTemperatureC?: number;
  activeMinutes?: number;
  computeMinutes?: number;
  timestamp?: number;
}

function formatTokenAmount(amount: bigint, token: string): string {
  if (token === ethers.ZeroAddress) return formatEthAmount(amount);
  return `${amount.toString()} ${token}`;
}

function buildUsageSummary(session: ComputeSessionView, current: CurrentComputeMetrics | null): ComputeUsageSummary {
  const ratePerHourWei = BigInt(session.proposal.ratePerHourWei);
  const depositWei = BigInt(session.proposal.depositAmount);
  const token = session.proposal.token ?? ethers.ZeroAddress;
  const consumedMinutes = current?.computeMinutes ?? session.consumedMinutes;
  const costWei = BigInt(consumedMinutes) * ratePerHourWei / 60n;
  const clampedCostWei = costWei > depositWei ? depositWei : costWei;
  const remainingWei = depositWei > clampedCostWei ? depositWei - clampedCostWei : 0n;
  const percentUsed = depositWei > 0n ? Number((clampedCostWei * 10_000n) / depositWei) / 100 : 0;

  return {
    consumed: formatDurationFromMinutes(consumedMinutes),
    cost: formatTokenAmount(clampedCostWei, token),
    remaining: formatTokenAmount(remainingWei, token),
    escrowCeiling: `escrow ceiling: ${formatTokenAmount(depositWei, token)}`,
    percentUsed,
  };
}

function buildMetricRows(current: CurrentComputeMetrics | null): ComputeMetric[] {
  if (!current) return [];

  const rows: ComputeMetric[] = [];
  if (typeof current.gpuUtilizationPercent === "number") {
    rows.push({ label: "GPU util", value: `${current.gpuUtilizationPercent}%` });
  }
  if (typeof current.gpuMemoryUsedMB === "number") {
    rows.push({ label: "Memory", value: `${current.gpuMemoryUsedMB} MB` });
  }
  if (typeof current.gpuTemperatureC === "number") {
    rows.push({ label: "Temp", value: `${current.gpuTemperatureC} C` });
  }
  if (typeof current.activeMinutes === "number") {
    rows.push({ label: "Active time", value: formatDurationFromMinutes(current.activeMinutes) });
  }
  if (typeof current.timestamp === "number") {
    rows.push({ label: "Last poll", value: formatUnixAge(current.timestamp) ?? "now" });
  }
  return rows;
}

function printLines(lines: string[]): void {
  lines.forEach((line) => console.log(line));
}

// ─── Daemon HTTP helper ───────────────────────────────────────────────────────

const DAEMON_TOKEN_FILE = path.join(DAEMON_DIR, "daemon.token");

function loadToken(): string | null {
  try {
    return fs.readFileSync(DAEMON_TOKEN_FILE, "utf-8").trim();
  } catch {
    return null;
  }
}

function daemonRequest(
  method: "GET" | "POST",
  urlPath: string,
  body?: Record<string, unknown>,
  port = 4402
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const token = loadToken();
    const payload = body ? JSON.stringify(body) : undefined;

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path:     urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, status: res.statusCode ?? 0, data });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, status: 0, data: { error: err.message } });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function getDaemonPort(): number {
  if (fs.existsSync(DAEMON_TOML)) {
    try {
      const { loadDaemonConfig } = require("../daemon/config") as typeof import("../daemon/config");
      const cfg = loadDaemonConfig();
      return cfg.relay?.listen_port ?? 4402;
    } catch { /* use default */ }
  }
  return 4402;
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerComputeCommands(program: Command): void {
  const compute = program
    .command("compute")
    .description("GPU compute rental — offer, hire, monitor, and settle compute sessions");

  // ── offer ────────────────────────────────────────────────────────────────

  compute
    .command("offer")
    .description("Register as a GPU provider — shows current config and how to enable")
    .action(() => {
      console.log(bold("ARC-402 Compute Offer — Provider Setup"));
      console.log("");

      if (!fs.existsSync(DAEMON_TOML)) {
        console.error(c.red("daemon.toml not found. Run: arc402 daemon init"));
        process.exit(1);
      }

      let cfg: import("../daemon/config").DaemonConfig;
      try {
        const { loadDaemonConfig } = require("../daemon/config") as typeof import("../daemon/config");
        cfg = loadDaemonConfig();
      } catch (err) {
        console.error(c.red(`Config error: ${err}`));
        process.exit(1);
      }

      const c2 = cfg.compute;
      console.log("Current [compute] config in daemon.toml:");
      console.log(`  enabled:                   ${c2.enabled}`);
      console.log(`  gpu_spec:                  ${c2.gpu_spec || c.dim("(not set)")}`);
      console.log(`  rate_per_hour_wei:         ${c2.rate_per_hour_wei}`);
      console.log(`  max_concurrent_sessions:   ${c2.max_concurrent_sessions}`);
      console.log(`  metering_interval_seconds: ${c2.metering_interval_seconds}`);
      console.log(`  report_interval_minutes:   ${c2.report_interval_minutes}`);
      console.log(`  auto_accept_compute:       ${c2.auto_accept_compute}`);
      console.log(`  min_session_hours:         ${c2.min_session_hours}`);
      console.log(`  max_session_hours:         ${c2.max_session_hours}`);
      console.log("");

      if (!c2.enabled) {
        console.log(c.yellow("Compute rental is disabled. To enable, add to daemon.toml:"));
        console.log("");
        console.log("  [compute]");
        console.log("  enabled = true");
        console.log('  gpu_spec = "nvidia-h100-80gb"');
        console.log('  rate_per_hour_wei = "3000000000000000000"  # 3 ETH/hour');
        console.log("");
        console.log("Then restart the daemon: arc402 daemon restart");
      } else {
        console.log(c.green("Compute rental is enabled."));
        console.log("Your node is accepting compute proposals at POST /compute/propose");
      }
    });

  // ── discover ─────────────────────────────────────────────────────────────

  compute
    .command("discover")
    .description("Find GPU providers (queries AgentRegistry for compute-capable agents)")
    .option("--gpu <spec>", "Filter by GPU spec (e.g. h100, 4090, a100)")
    .option("--max-rate <wei>", "Maximum acceptable rate per hour in Wei")
    .option("--json", "Output raw JSON")
    .action(async (opts: { gpu?: string; maxRate?: string; json?: boolean }) => {
      const config = loadConfig();
      const registryAddress = config.agentRegistryV2Address ?? config.agentRegistryAddress;
      if (!registryAddress) {
        console.error(c.red("agentRegistryAddress not configured. Add it to ~/.arc402/config.json"));
        process.exit(1);
      }

      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);

      let count: bigint;
      try {
        count = await registry.agentCount() as bigint;
      } catch {
        console.error(c.red("Failed to query AgentRegistry. Check rpcUrl and agentRegistryAddress."));
        process.exit(1);
      }

      const gpuFilter = opts.gpu ? `gpu-${opts.gpu.toLowerCase()}` : null;
      const maxRateFilter = opts.maxRate ? BigInt(opts.maxRate) : null;

      const matches: Array<{ address: string; name: string; endpoint: string; capabilities: string[] }> = [];
      for (let i = 0n; i < count; i++) {
        try {
          const addr: string = await registry.getAgentAtIndex(i) as string;
          const agent = await registry.getAgent(addr) as {
            wallet: string; name: string; capabilities: string[]; serviceType: string;
            endpoint: string; metadataURI: string; active: boolean;
          };
          if (!agent.active) continue;
          const caps = agent.capabilities.map((c: string) => c.toLowerCase());
          const isCompute = caps.some((cap: string) => cap.startsWith("gpu-") || cap === "gpu-compute");
          if (!isCompute) continue;
          if (gpuFilter && !caps.includes(gpuFilter)) continue;
          matches.push({ address: addr, name: agent.name, endpoint: agent.endpoint, capabilities: agent.capabilities });
        } catch { /* skip bad entries */ }
      }

      if (opts.json) {
        console.log(JSON.stringify(matches, null, 2));
        return;
      }

      if (matches.length === 0) {
        console.log(c.dim("No GPU compute providers found in AgentRegistry."));
        return;
      }

      console.log(bold(`GPU Compute Providers (${matches.length}):`));
      console.log("");
      for (const m of matches) {
        console.log(`  ${c.white(m.name)} — ${c.dim(m.address)}`);
        console.log(`    ${c.dim("Endpoint:")} ${m.endpoint || c.dim("(none)")}`);
        console.log(`    ${c.dim("GPU:")} ${m.capabilities.filter(cap => cap.toLowerCase().startsWith("gpu-")).join(", ")}`);
        console.log("");
      }
    });

  // ── hire ──────────────────────────────────────────────────────────────────

  compute
    .command("hire <provider>")
    .description("Propose a compute session to a GPU provider (calls proposeSession on-chain)")
    .requiredOption("--hours <n>", "Maximum session hours", (v) => parseInt(v, 10))
    .requiredOption("--rate <wei>", "Provider rate per hour in Wei")
    .option("--deposit <wei>", "Deposit amount in Wei (defaults to rate * hours)")
    .option("--workload <description>", "Description of the workload", "")
    .option("--gpu-spec-hash <hash>", "GPU spec hash (bytes32 hex)", "0x0000000000000000000000000000000000000000000000000000000000000000")
    .option("--session-id <id>", "Custom session ID (defaults to random bytes32)")
    .option("--token <address>", "ERC-20 token address for payment (default: ETH)", ethers.ZeroAddress)
    .option("--notify-url <url>", "Provider HTTP endpoint to notify after on-chain proposal")
    .action(async (provider: string, opts: {
      hours: number;
      rate: string;
      deposit?: string;
      workload: string;
      gpuSpecHash: string;
      sessionId?: string;
      token: string;
      notifyUrl?: string;
    }) => {
      const config = loadConfig();
      const computeAddr = config.computeAgreementAddress
        ?? NETWORK_DEFAULTS["base-mainnet"].computeAgreementAddress;
      if (!computeAddr) {
        console.error(c.red("computeAgreementAddress missing in config (~/.arc402/config.json)"));
        process.exit(1);
      }
      config.computeAgreementAddress = computeAddr;
      const { signer, address } = await requireSigner(config);
      printSenderInfo(config);

      const sessionId = opts.sessionId ?? ("0x" + require("crypto").randomBytes(32).toString("hex"));
      const ratePerHour = BigInt(opts.rate);
      const maxHours = BigInt(opts.hours);
      const deposit = opts.deposit ? BigInt(opts.deposit) : ratePerHour * maxHours;
      const token = opts.token ?? ethers.ZeroAddress;
      const isEth = token === ethers.ZeroAddress;

      const hireSpinner = startSpinner("Proposing compute session on-chain...");
      try {
        if (config.walletContractAddress) {
          await executeContractWriteViaWallet(
            config.walletContractAddress, signer, config.computeAgreementAddress,
            COMPUTE_AGREEMENT_ABI, "proposeSession",
            [sessionId, provider, ratePerHour, maxHours, opts.gpuSpecHash, token],
            isEth ? deposit : 0n,
            isEth ? ethers.ZeroAddress : token,
            isEth ? 0n : deposit,
          );
        } else {
          const contract = new ethers.Contract(config.computeAgreementAddress, COMPUTE_AGREEMENT_ABI, signer);
          const tx = await contract.proposeSession(
            sessionId, provider, ratePerHour, maxHours, opts.gpuSpecHash, token,
            { value: isEth ? deposit : 0n },
          );
          await tx.wait();
        }
        hireSpinner.succeed(" Compute session proposed on-chain");
      } catch (err) {
        hireSpinner.fail(` Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      printLines(renderComputeCardText({
        title: "Compute Session Proposed",
        sessionId,
        provider,
        gpuSpec: opts.gpuSpecHash,
        rate: isEth ? `${formatEthAmount(ratePerHour)} / hour` : `${opts.rate} ${token} / hour`,
        status: "PROPOSED",
        usage: {
          consumed: "0m",
          cost: isEth ? formatEthAmount(0n) : `0 ${token}`,
          remaining: isEth ? formatEthAmount(deposit) : `${deposit.toString()} ${token}`,
          escrowCeiling: `escrow ceiling: ${isEth ? formatEthAmount(deposit) : `${deposit.toString()} ${token}`}`,
          percentUsed: 0,
        },
      }));

      // Notify provider's HTTP endpoint (non-blocking)
      if (opts.notifyUrl) {
        try {
          const notifyUrl = new URL("/compute/propose", opts.notifyUrl);
          const notifyPayload = JSON.stringify({
            sessionId, clientAddress: address, maxHours: opts.hours,
            gpuSpecHash: opts.gpuSpecHash, workloadDescription: opts.workload,
          });
          await new Promise<void>((resolve) => {
            const req = https_or_http(notifyUrl).request(
              { hostname: notifyUrl.hostname, port: notifyUrl.port || (notifyUrl.protocol === "https:" ? 443 : 80),
                path: notifyUrl.pathname, method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(notifyPayload) } },
              (r) => { r.resume(); r.on("end", resolve); }
            );
            req.on("error", resolve);
            req.write(notifyPayload);
            req.end();
          });
          console.log(c.dim("  Provider notified at " + opts.notifyUrl));
        } catch { /* non-fatal */ }
      }

      console.log(c.dim(`\narc402 compute status ${sessionId}   <- monitor session`));
    });

  // ── status ────────────────────────────────────────────────────────────────

  compute
    .command("status [session-id]")
    .description("Check session status and current GPU metrics")
    .option("--url <provider-url>", "Provider endpoint (defaults to local daemon)")
    .action(async (sessionId: string | undefined, opts: { url?: string }) => {
      const port = getDaemonPort();

      if (!sessionId) {
        // List all sessions on local daemon
        const result = await daemonRequest("GET", "/compute/sessions", undefined, port);
        if (!result.ok) {
          console.error(c.red("Failed to fetch sessions:"), result.data);
          process.exit(1);
        }
        const { sessions } = result.data as { sessions: unknown[]; count: number };
        if (!sessions || sessions.length === 0) {
          console.log("No compute sessions.");
          return;
        }
        console.log(bold(`Compute sessions (${sessions.length}):`));
        console.log("");
        for (const state of sessions as ComputeSessionView[]) {
          const age = state.startedAt ? `started ${formatUnixAge(state.startedAt)}` : "not started";
          printLines(renderComputeCardText({
            title: "Compute Session",
            sessionId: state.proposal.sessionId,
            provider: state.proposal.providerAddress ?? state.proposal.clientAddress,
            gpuSpec: state.proposal.gpuSpecHash,
            rate: `${formatEthAmount(BigInt(state.proposal.ratePerHourWei))} / hour`,
            status: state.status.toUpperCase(),
            started: age,
            usage: buildUsageSummary(state, null),
          }));
          console.log("");
        }
        return;
      }

      const result = await daemonRequest("GET", `/compute/session/${sessionId}`, undefined, port);
      if (!result.ok) {
        console.error(c.red("Session not found:"), result.data);
        process.exit(1);
      }
      const { session, current } = result.data as { session: ComputeSessionView; current: CurrentComputeMetrics | null };
      printLines(renderComputeCardText({
        title: "Compute Session",
        sessionId,
        provider: session.proposal.providerAddress ?? session.proposal.clientAddress,
        gpuSpec: session.proposal.gpuSpecHash,
        rate: `${formatEthAmount(BigInt(session.proposal.ratePerHourWei))} / hour`,
        started: session.startedAt ? formatUnixAge(session.startedAt) : "not started",
        status: session.status.toUpperCase(),
        usage: buildUsageSummary(session, current),
        metrics: buildMetricRows(current),
        footerHints: [
          "arc402 compute end <session-id>   <- settle now",
          current ? "[live snapshot from daemon metering]" : "[no live metrics available]",
        ],
      }));
    });

  // ── end ───────────────────────────────────────────────────────────────────

  compute
    .command("end <session-id>")
    .description("End a compute session and settle on-chain")
    .option("--url <provider-url>", "Provider endpoint (defaults to local daemon)")
    .action(async (sessionId: string, opts: { url?: string }) => {
      const config = loadConfig();
      config.computeAgreementAddress ??= NETWORK_DEFAULTS["base-mainnet"].computeAgreementAddress;
      const port = getDaemonPort();

      const endSpinner = startSpinner(`Ending session ${sessionId}...`);

      // Call on-chain if computeAgreementAddress is configured
      if (config.computeAgreementAddress) {
        try {
          const { signer } = await requireSigner(config);
          if (config.walletContractAddress) {
            await executeContractWriteViaWallet(
              config.walletContractAddress, signer, config.computeAgreementAddress,
              COMPUTE_AGREEMENT_ABI, "endSession", [sessionId],
            );
          } else {
            const contract = new ethers.Contract(config.computeAgreementAddress, COMPUTE_AGREEMENT_ABI, signer);
            const tx = await contract.endSession(sessionId);
            await tx.wait();
          }
        } catch (err) {
          console.warn(c.yellow(`  Warning: on-chain endSession failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      }

      // Notify local daemon
      const result = await daemonRequest("POST", "/compute/end", { sessionId }, port);
      if (!result.ok) {
        endSpinner.fail(c.red(" Failed to end session in daemon"));
        console.error(result.data);
        process.exit(1);
      }

      const data = result.data as {
        status: string;
        consumedMinutes: number;
        costWei: string;
        refundWei: string;
      };

      endSpinner.succeed(" Session ended");
      printLines(renderComputeCardText({
        title: "Compute Session Ended",
        sessionId,
        provider: "settlement",
        rate: "finalized",
        status: data.status.toUpperCase(),
        usage: {
          consumed: formatDurationFromMinutes(data.consumedMinutes),
          cost: formatEthAmount(BigInt(data.costWei)),
          remaining: formatEthAmount(BigInt(data.refundWei)),
          escrowCeiling: "refund released",
          percentUsed: undefined,
        },
      }));
    });

  // ── withdraw ──────────────────────────────────────────────────────────────

  compute
    .command("withdraw")
    .description("Withdraw settled funds from ComputeAgreement contract")
    .option("--token <address>", "ERC-20 token address (default: ETH / address(0))", ethers.ZeroAddress)
    .action(async (opts: { token: string }) => {
      const config = loadConfig();
      config.computeAgreementAddress ??= NETWORK_DEFAULTS["base-mainnet"].computeAgreementAddress;
      if (!config.computeAgreementAddress) {
        console.error(c.red("computeAgreementAddress missing in config"));
        process.exit(1);
      }
      const { signer } = await requireSigner(config);
      printSenderInfo(config);
      const token = opts.token ?? ethers.ZeroAddress;
      const withdrawSpinner = startSpinner("Withdrawing funds...");
      try {
        if (config.walletContractAddress) {
          await executeContractWriteViaWallet(
            config.walletContractAddress, signer, config.computeAgreementAddress,
            COMPUTE_AGREEMENT_ABI, "withdraw", [token],
          );
        } else {
          const contract = new ethers.Contract(config.computeAgreementAddress, COMPUTE_AGREEMENT_ABI, signer);
          const tx = await contract.withdraw(token);
          await tx.wait();
        }
        withdrawSpinner.succeed(" Funds withdrawn");
      } catch (err) {
        withdrawSpinner.fail(` Withdrawal failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ── sessions ──────────────────────────────────────────────────────────────

  compute
    .command("sessions")
    .description("List all compute sessions on this node")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const port = getDaemonPort();
      const result = await daemonRequest("GET", "/compute/sessions", undefined, port);
      if (!result.ok) {
        console.error(c.red("Failed to fetch sessions:"), result.data);
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }

      const { sessions, count } = result.data as { sessions: Array<Record<string, unknown>>; count: number };
      if (count === 0) {
        console.log("No compute sessions.");
        return;
      }

      console.log(bold(`Compute sessions (${count}):`));
      console.log("");
      for (const s of sessions as unknown as unknown as ComputeSessionView[]) {
        printLines(renderComputeCardText({
          title: "Compute Session",
          sessionId: s.proposal.sessionId,
          provider: s.proposal.providerAddress ?? s.proposal.clientAddress,
          gpuSpec: s.proposal.gpuSpecHash,
          rate: `${formatEthAmount(BigInt(s.proposal.ratePerHourWei))} / hour`,
          started: s.startedAt ? formatUnixAge(s.startedAt) : "not started",
          status: s.status.toUpperCase(),
          usage: buildUsageSummary(s, null),
          footerHints: [
            `max ${s.proposal.maxHours}h`,
            s.endedAt ? `ended ${formatUnixAge(s.endedAt)}` : "",
          ].filter(Boolean),
        }));
        console.log("");
      }
    });
}

// ─── Util: pick http or https module ─────────────────────────────────────────

function https_or_http(url: URL): typeof import("http") | typeof import("https") {
  return url.protocol === "https:" ? require("https") : require("http");
}

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { configExists, loadConfig } from "../config";
import { c } from "../ui/colors";

const ARC402_DIR = path.join(os.homedir(), ".arc402");
const CONFIG_PATH = path.join(ARC402_DIR, "config.json");
const DAEMON_PID_PATH = path.join(ARC402_DIR, "daemon.pid");

function ok(label: string, detail?: string): void {
  process.stdout.write(
    "  " + chalk.green("✓") + " " + chalk.white(label) + (detail ? chalk.dim("  " + detail) : "") + "\n"
  );
}

function fail(label: string, detail?: string): void {
  process.stdout.write(
    "  " + chalk.red("✗") + " " + chalk.white(label) + (detail ? chalk.dim("  " + detail) : "") + "\n"
  );
}

function warn(label: string, detail?: string): void {
  process.stdout.write(
    "  " + chalk.yellow("⚠") + " " + chalk.white(label) + (detail ? chalk.dim("  " + detail) : "") + "\n"
  );
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check ARC-402 environment health")
    .action(async () => {
      process.stdout.write("\n" + c.cyan("◈ ") + chalk.white("arc402 doctor") + "\n\n");

      // ── 1. Config exists ───────────────────────────────────────────────────
      if (configExists()) {
        ok("Config found", CONFIG_PATH);
      } else {
        fail("Config not found", "Run: arc402 config init");
        process.stdout.write("\n");
        return;
      }

      const config = loadConfig();

      // ── 2. RPC reachable ───────────────────────────────────────────────────
      try {
        const body = JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 });
        const res = await fetch(config.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(5000),
        });
        const json = await res.json() as { result?: string };
        if (json.result) {
          const block = parseInt(json.result, 16);
          ok("RPC reachable", `block #${block.toLocaleString()}`);
        } else {
          fail("RPC returned no block", config.rpcUrl);
        }
      } catch (err) {
        fail("RPC unreachable", config.rpcUrl + " — " + (err instanceof Error ? err.message : String(err)));
      }

      // ── 3. Wallet deployed ─────────────────────────────────────────────────
      if (config.walletContractAddress) {
        try {
          const body = JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getCode",
            params: [config.walletContractAddress, "latest"],
            id: 1,
          });
          const res = await fetch(config.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: AbortSignal.timeout(5000),
          });
          const json = await res.json() as { result?: string };
          if (json.result && json.result !== "0x" && json.result.length > 2) {
            ok("Wallet deployed", config.walletContractAddress);
          } else {
            fail("Wallet not deployed", config.walletContractAddress + " — no code at address");
          }
        } catch (err) {
          warn("Wallet check failed", err instanceof Error ? err.message : String(err));
        }
      } else {
        warn("Wallet not configured", "Run: arc402 wallet deploy");
      }

      // ── 4. Machine key authorized ──────────────────────────────────────────
      if (config.privateKey && config.walletContractAddress) {
        try {
          const { ethers } = await import("ethers");
          const machineKey = new ethers.Wallet(config.privateKey);
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          const iface = new ethers.Interface(["function authorizedMachineKeys(address) external view returns (bool)"]);
          const data = iface.encodeFunctionData("authorizedMachineKeys", [machineKey.address]);
          const result = await Promise.race([
            provider.call({ to: config.walletContractAddress, data }),
            new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
          ]);
          const authorized = iface.decodeFunctionResult("authorizedMachineKeys", result)[0] as boolean;
          if (authorized) {
            ok("Machine key authorized", machineKey.address);
          } else {
            fail("Machine key not authorized", machineKey.address + " — run: arc402 wallet onboard");
          }
        } catch (err) {
          warn("Machine key check failed", err instanceof Error ? err.message : String(err));
        }
      } else if (!config.privateKey) {
        warn("Machine key not configured", "No privateKey in config");
      }

      // ── 5. Daemon running ──────────────────────────────────────────────────
      let daemonRunning = false;
      if (fs.existsSync(DAEMON_PID_PATH)) {
        try {
          const pid = parseInt(fs.readFileSync(DAEMON_PID_PATH, "utf-8").trim(), 10);
          // Check if process is alive
          process.kill(pid, 0);
          daemonRunning = true;
          ok("Daemon running", `PID ${pid}`);
        } catch {
          fail("Daemon PID file stale", "Run: arc402 daemon start");
        }
      } else {
        fail("Daemon not running", "Run: arc402 daemon start");
      }

      // ── 6. Docker available ────────────────────────────────────────────────
      try {
        const docker = spawnSync("docker", ["--version"], { encoding: "utf-8", timeout: 3000 });
        if (docker.status === 0) {
          ok("Docker available", docker.stdout.trim().split("\n")[0]);
        } else {
          warn("Docker not found", "Install from https://docs.docker.com/get-docker/");
        }
      } catch {
        warn("Docker not found", "Install from https://docs.docker.com/get-docker/");
      }

      // ── 7. HTTP relay reachable (if daemon is running) ─────────────────────
      if (daemonRunning) {
        try {
          const health = await fetchJson("http://localhost:4402/health") as { status?: string };
          if (health.status === "online") {
            ok("HTTP relay reachable", "http://localhost:4402");
          } else {
            warn("HTTP relay responded", JSON.stringify(health));
          }
        } catch {
          fail("HTTP relay not reachable", "http://localhost:4402 — daemon may still be starting");
        }
      }

      process.stdout.write("\n");
    });
}

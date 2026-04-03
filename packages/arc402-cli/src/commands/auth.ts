/**
 * arc402 auth — Remote Daemon Auth (Spec 46 §11)
 *
 * Subcommands:
 *   arc402 auth status   — check current session token
 *   arc402 auth sign     — request challenge, sign with machine key, store 24h JWT
 *   arc402 auth revoke   — invalidate current session on daemon
 */
import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ethers } from "ethers";
import { loadConfig } from "../config";

const SESSION_TOKEN_PATH = path.join(os.homedir(), ".arc402", "session.token");

function getDaemonUrl(baseUrl?: string): string {
  if (baseUrl) return baseUrl;
  try {
    const config = loadConfig() as unknown as Record<string, unknown>;
    return (config["daemonEndpoint"] as string | undefined) ?? "http://127.0.0.1:4402";
  } catch {
    return "http://127.0.0.1:4402";
  }
}

function readToken(): string | null {
  if (fs.existsSync(SESSION_TOKEN_PATH)) {
    return fs.readFileSync(SESSION_TOKEN_PATH, "utf-8").trim();
  }
  return null;
}

export function registerAuthCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authenticate with ARC-402 daemon (Spec 46 §11 remote auth)");

  // ── arc402 auth status ─────────────────────────────────────────────────────
  auth
    .command("status")
    .description("Check current session status with the daemon")
    .option("--daemon-url <url>", "Override daemon URL")
    .action(async (opts: { daemonUrl?: string }) => {
      const url = getDaemonUrl(opts.daemonUrl);
      const token = readToken();
      try {
        const res = await fetch(`${url}/auth/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(3000),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (data["authenticated"]) {
          const expiresIn = Number(data["expiresIn"]);
          const h = Math.floor(expiresIn / 3600);
          const m = Math.floor((expiresIn % 3600) / 60);
          console.log(chalk.green("\n✓ Authenticated"));
          console.log(chalk.dim(`  Wallet:  ${data["walletAddress"]}`));
          console.log(chalk.dim(`  Scope:   ${data["scope"] ?? "operator"}`));
          console.log(chalk.dim(`  Valid:   ${h}h ${m}m remaining\n`));
        } else {
          console.log(chalk.yellow("\n  Not authenticated. Run: arc402 auth sign\n"));
        }
      } catch {
        console.log(chalk.dim("\n  Daemon not reachable. No auth status available.\n"));
      }
    });

  // ── arc402 auth sign ───────────────────────────────────────────────────────
  auth
    .command("sign")
    .description(
      "Sign an auth challenge with the machine key and store a 24h session token"
    )
    .option("--daemon-url <url>", "Override daemon URL")
    .option("--wallet <address>", "Wallet address to authenticate against")
    .option("--scope <scope>", "Requested scope (default: operator)", "operator")
    .action(async (opts: { daemonUrl?: string; wallet?: string; scope?: string }) => {
      const url = getDaemonUrl(opts.daemonUrl);
      const config = loadConfig() as unknown as Record<string, unknown>;

      const machineKeyPriv = config["machineKeyPrivateKey"] as string | undefined;
      if (!machineKeyPriv) {
        console.error(
          chalk.red(
            "\n  machineKeyPrivateKey not found in ~/.arc402/config.json"
          )
        );
        console.error(
          chalk.dim(
            "  Add machineKeyPrivateKey to your config to enable remote auth.\n"
          )
        );
        process.exit(1);
      }

      const wallet =
        opts.wallet ??
        (config["walletAddress"] as string | undefined) ??
        (config["wallet"] as Record<string, unknown> | undefined)?.["contract_address"] as string | undefined;

      if (!wallet) {
        console.error(
          chalk.red("\n  Could not determine wallet address. Pass --wallet <address>.\n")
        );
        process.exit(1);
      }

      try {
        console.log(chalk.dim("  Requesting auth challenge..."));
        const challengeRes = await fetch(
          `${url}/auth/challenge?wallet=${encodeURIComponent(wallet)}&scope=${encodeURIComponent(opts.scope ?? "operator")}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!challengeRes.ok) {
          console.error(
            chalk.red(`  Challenge failed: HTTP ${challengeRes.status}`)
          );
          process.exit(1);
        }
        const challenge = (await challengeRes.json()) as {
          challengeId: string;
          challenge: string;
          expiresAt: number;
        };

        console.log(chalk.dim("  Signing challenge with machine key..."));
        const signer = new ethers.Wallet(machineKeyPriv);
        const signature = await signer.signMessage(challenge.challenge);

        console.log(chalk.dim("  Exchanging signature for session token..."));
        const sessionRes = await fetch(`${url}/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            signature,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const session = (await sessionRes.json()) as {
          ok?: boolean;
          token?: string;
          error?: string;
          walletAddress?: string;
          wallet?: string;
          expiresAt?: number;
        };

        if (!session.token) {
          console.error(
            chalk.red(`  Auth failed: ${session.error ?? "unknown"}`)
          );
          process.exit(1);
        }

        fs.writeFileSync(SESSION_TOKEN_PATH, session.token, { mode: 0o600 });
        const expiresMs = session.expiresAt
          ? session.expiresAt - Date.now()
          : 86400_000;
        const h = Math.floor(expiresMs / 3_600_000);
        console.log(
          chalk.green(
            `\n✓ Authenticated — ${session.walletAddress ?? session.wallet ?? wallet}`
          )
        );
        console.log(chalk.dim(`  Token saved: ${SESSION_TOKEN_PATH} (~${h}h)\n`));
      } catch (err) {
        console.error(
          chalk.red(
            `  Auth error: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        process.exit(1);
      }
    });

  // ── arc402 auth revoke ─────────────────────────────────────────────────────
  auth
    .command("revoke")
    .description("Revoke current session token on daemon and delete local copy")
    .option("--daemon-url <url>", "Override daemon URL")
    .action(async (opts: { daemonUrl?: string }) => {
      const url = getDaemonUrl(opts.daemonUrl);
      const token = readToken();

      if (token) {
        try {
          await fetch(`${url}/auth/revoke`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          /* daemon unreachable — still delete local token */
        }
        fs.unlinkSync(SESSION_TOKEN_PATH);
        console.log(chalk.green("✓ Session token revoked"));
      } else {
        console.log(chalk.dim("  No session token found."));
      }
    });
}

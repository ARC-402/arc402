import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as YAML from "yaml";
import {
  ARC402_DIR,
  DEFAULT_RUNTIME_REMOTE_ROOT,
  OPENSHELL_TOML,
  buildOpenShellSshConfig,
  detectDockerAccess,
  provisionRuntimeToSandbox,
  readOpenShellConfig,
  resolveOpenShellSecrets,
  runCmd,
  writeOpenShellConfig,
} from "../openshell-runtime";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_FILE = path.join(ARC402_DIR, "openshell-policy.yaml");
const SANDBOX_NAME = "arc402-daemon";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NetworkEndpoint {
  host: string;
  port: number;
  protocol: string;
  tls: string;
  enforcement: string;
  access: string;
}

interface NetworkPolicy {
  name: string;
  endpoints: NetworkEndpoint[];
  binaries: Array<{ path: string }>;
}

interface PolicyFile {
  version: number;
  filesystem_policy: {
    include_workdir: boolean;
    read_only: string[];
    read_write: string[];
  };
  landlock: { compatibility: string };
  process: { run_as_user: string; run_as_group: string };
  network_policies: Record<string, NetworkPolicy>;
}

// ─── Default policy ───────────────────────────────────────────────────────────

function buildDefaultPolicy(): PolicyFile {
  const nodeBinaries = [
    { path: "/usr/bin/node" },
    { path: "/usr/local/bin/node" },
  ];

  return {
    version: 1,
    filesystem_policy: {
      include_workdir: true,
      read_only: ["/usr", "/lib", "/proc", "/etc", "/var/log"],
      read_write: [path.join(os.homedir(), ".arc402"), "/tmp", "/dev/null"],
    },
    landlock: {
      compatibility: "best_effort",
    },
    process: {
      run_as_user: "sandbox",
      run_as_group: "sandbox",
    },
    network_policies: {
      base_rpc: {
        name: "base-mainnet-rpc",
        endpoints: [
          {
            host: "mainnet.base.org",
            port: 443,
            protocol: "rest",
            tls: "terminate",
            enforcement: "enforce",
            access: "read-write",
          },
        ],
        binaries: nodeBinaries,
      },
      arc402_relay: {
        name: "arc402-relay",
        endpoints: [
          {
            host: "relay.arc402.xyz",
            port: 443,
            protocol: "rest",
            tls: "terminate",
            enforcement: "enforce",
            access: "read-write",
          },
        ],
        binaries: nodeBinaries,
      },
      bundler: {
        name: "pimlico-bundler",
        endpoints: [
          {
            host: "public.pimlico.io",
            port: 443,
            protocol: "rest",
            tls: "terminate",
            enforcement: "enforce",
            access: "read-write",
          },
        ],
        binaries: nodeBinaries,
      },
      telegram: {
        name: "telegram-notifications",
        endpoints: [
          {
            host: "api.telegram.org",
            port: 443,
            protocol: "rest",
            tls: "terminate",
            enforcement: "enforce",
            access: "read-write",
          },
        ],
        binaries: nodeBinaries,
      },
    },
  };
}

// ─── Check helpers ────────────────────────────────────────────────────────────

function checkOpenShellInstalled(): string | null {
  const r = runCmd("which", ["openshell"]);
  if (!r.ok) return null;
  return r.stdout;
}

function ensureDockerAccessOrExit(prefix = "Docker", docker = detectDockerAccess()): void {
  if (docker.ok) return;
  if (docker.detail.includes("permission")) {
    console.error("Grant this shell access to the Docker daemon, then retry.");
  } else if (docker.detail.includes("not running")) {
    console.error("Start Docker Desktop / the Docker daemon, then retry.");
  } else if (docker.detail.includes("not installed")) {
    console.error("Install Docker first, then retry.");
  }
  process.exit(1);
}

// ─── Policy file helpers ──────────────────────────────────────────────────────

function loadPolicyFile(): PolicyFile | null {
  if (!fs.existsSync(POLICY_FILE)) return null;
  try {
    const raw = fs.readFileSync(POLICY_FILE, "utf-8");
    return YAML.parse(raw) as PolicyFile;
  } catch {
    return null;
  }
}

function writePolicyFile(policy: PolicyFile): void {
  fs.mkdirSync(ARC402_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(POLICY_FILE, YAML.stringify(policy), { mode: 0o600 });
}

function hotReloadPolicy(): void {
  const r = runCmd("openshell", [
    "policy", "set", SANDBOX_NAME,
    "--policy", POLICY_FILE,
    "--wait",
  ]);
  if (!r.ok) {
    console.warn(`  Warning: hot-reload failed: ${r.stderr}`);
  }
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerOpenShellCommands(program: Command): void {
  const openshell = program
    .command("openshell")
    .description("OpenShell sandbox integration for the ARC-402 daemon (Spec 34)");

  // ── openshell install ──────────────────────────────────────────────────────
  openshell
    .command("install")
    .description("Install OpenShell from the official source (requires Docker).")
    .action(() => {
      console.log("OpenShell Install");
      console.log("─────────────────");

      // Check Docker
      process.stdout.write("Checking Docker... ");
      const docker = detectDockerAccess();
      if (!docker.ok) {
        console.log(docker.detail);
        ensureDockerAccessOrExit("Docker", docker);
      }
      console.log(docker.detail);

      // Download + install OpenShell
      console.log("\nDownloading OpenShell from github.com/NVIDIA/OpenShell ...");
      const install = runCmd("sh", ["-c",
        "curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh"
      ], { timeout: 120000 });

      if (!install.ok) {
        console.error("Install failed:");
        console.error(install.stderr || install.stdout);
        process.exit(1);
      }

      if (install.stdout) console.log(install.stdout);

      // Verify
      process.stdout.write("Verifying... ");
      const verify = runCmd("openshell", ["--version"]);
      if (!verify.ok) {
        console.log("not found in PATH");
        console.error("openshell not found after install. Ensure ~/.local/bin is in your PATH.");
        console.error("  export PATH=\"$HOME/.local/bin:$PATH\"");
        process.exit(1);
      }
      console.log(verify.stdout);

      const status = runCmd("openshell", ["status"]);
      if (!status.ok) {
        console.log("\nOpenShell installed, but the gateway is not healthy yet.");
        console.log("Run one of:");
        console.log("  openshell gateway start");
        console.log("  openshell doctor");
      }

      console.log("\nOpenShell installed successfully.");
      console.log("Run: arc402 openshell init");
    });

  // ── openshell init ─────────────────────────────────────────────────────────
  openshell
    .command("init")
    .description("Initialize the launch runtime once: create the arc402-daemon sandbox, write the default policy, and hide OpenShell wiring behind ARC-402 commands.")
    .action(() => {
      console.log("OpenShell Init");
      console.log("──────────────");

      process.stdout.write("OpenShell:  ");
      const shellPath = checkOpenShellInstalled();
      if (!shellPath) {
        console.log("not installed");
        console.error("OpenShell is not installed. Run: arc402 openshell install");
        process.exit(1);
      }
      const vr = runCmd("openshell", ["--version"]);
      console.log(vr.stdout || "installed");

      const gatewayStatus = runCmd("openshell", ["status"], { timeout: 30000 });
      process.stdout.write("Docker:     ");
      const docker = detectDockerAccess();
      if (!docker.ok) {
        if (gatewayStatus.ok) {
          console.log(`${docker.detail} (continuing because OpenShell gateway is already connected)`);
        } else {
          console.log(docker.detail);
          ensureDockerAccessOrExit("Docker", docker);
        }
      } else {
        console.log(docker.detail);
      }

      console.log("\nGenerating policy file...");
      const policy = buildDefaultPolicy();
      writePolicyFile(policy);
      console.log(`  Written: ${POLICY_FILE}`);

      console.log("\nCreating credential providers...");
      const secrets = resolveOpenShellSecrets();
      const providerResult = (name: string, credentials: string[], missingMessage: string) => {
        if (credentials.length === 0) {
          console.warn(`  Warning: ${name}: ${missingMessage}`);
          return;
        }

        const createArgs = ["provider", "create", "--name", name, "--type", "generic"];
        for (const credential of credentials) createArgs.push("--credential", credential);
        const created = runCmd("openshell", createArgs);
        if (created.ok) {
          console.log(`  Ready:   ${name}`);
          return;
        }

        if ((created.stderr || created.stdout).includes("already exists")) {
          const updateArgs = ["provider", "update", name];
          for (const credential of credentials) updateArgs.push("--credential", credential);
          const updated = runCmd("openshell", updateArgs);
          if (updated.ok) {
            console.log(`  Updated: ${name}`);
            return;
          }
          console.warn(`  Warning: ${name}: ${updated.stderr || updated.stdout}`);
          return;
        }

        console.warn(`  Warning: ${name}: ${created.stderr || created.stdout}`);
      };

      providerResult(
        "arc402-machine-key",
        secrets.machineKey ? [`ARC402_MACHINE_KEY=${secrets.machineKey}`] : [],
        "machine key not found in env or arc402 config; provider left unchanged",
      );

      providerResult(
        "arc402-notifications",
        [
          secrets.telegramBotToken ? `TELEGRAM_BOT_TOKEN=${secrets.telegramBotToken}` : "",
          secrets.telegramChatId ? `TELEGRAM_CHAT_ID=${secrets.telegramChatId}` : "",
        ].filter(Boolean),
        "Telegram credentials not found in env or arc402 config; provider left unchanged",
      );

      console.log("\nEnsuring sandbox exists...");
      const sandboxLookup = runCmd("openshell", ["sandbox", "get", SANDBOX_NAME], { timeout: 120000 });
      if (!sandboxLookup.ok) {
        const createSandbox = runCmd("openshell", [
          "sandbox", "create",
          "--name", SANDBOX_NAME,
          "--from", "openclaw",
          "--policy", POLICY_FILE,
          "--provider", "arc402-machine-key",
          "--provider", "arc402-notifications",
          "--",
          "true",
        ], { timeout: 180000 });
        if (!createSandbox.ok) {
          console.error(`Failed to create sandbox: ${createSandbox.stderr || createSandbox.stdout}`);
          process.exit(1);
        }
        console.log(`  Created: ${SANDBOX_NAME}`);
      } else {
        console.log(`  Reusing:  ${SANDBOX_NAME}`);
      }

      console.log("\nProvisioning ARC-402 runtime bundle into the sandbox...");
      let tarballPath = "";
      let remoteRoot = DEFAULT_RUNTIME_REMOTE_ROOT;
      try {
        const provisioned = provisionRuntimeToSandbox(SANDBOX_NAME, DEFAULT_RUNTIME_REMOTE_ROOT);
        tarballPath = provisioned.tarballPath;
        remoteRoot = provisioned.remoteRoot;
        console.log(`  Uploaded: ${tarballPath}`);
        console.log(`  Remote:   ${remoteRoot}`);
      } catch (err) {
        console.error(`Failed to provision runtime bundle: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      writeOpenShellConfig({
        sandbox: {
          name: SANDBOX_NAME,
          policy: POLICY_FILE,
          providers: ["arc402-machine-key", "arc402-notifications"],
        },
        runtime: {
          local_tarball: tarballPath,
          remote_root: remoteRoot,
          synced_at: new Date().toISOString(),
        },
      });
      console.log(`\nConfig: ${OPENSHELL_TOML}`);

      console.log(`
OpenShell integration configured.

  Sandbox:   ${SANDBOX_NAME}
  Policy:    ${POLICY_FILE}
  Runtime:   daemon + workers run inside the sandbox from a synced ARC-402 CLI bundle
  Remote:    ${remoteRoot}

arc402 daemon start will now use the provisioned ARC-402 runtime inside ${SANDBOX_NAME}.
Default policy: Base RPC + relay + bundler + Telegram API. All other network access blocked.

To allow additional endpoints for your harness or worker tools:
  Edit ${POLICY_FILE} → network_policies section
  Or: arc402 openshell policy add <name> <host>
  Then hot-reload: openshell policy set ${SANDBOX_NAME} --policy ${POLICY_FILE} --wait
  No daemon restart needed.

If you update the local CLI build and want the sandbox to pick it up immediately:
  arc402 openshell sync-runtime`);
    });

  // ── openshell sync-runtime ────────────────────────────────────────────────
  openshell
    .command("sync-runtime")
    .description("Package the local ARC-402 CLI and upload it into the configured OpenShell sandbox so daemon startup is genuinely one-click.")
    .action(() => {
      const cfg = readOpenShellConfig();
      if (!cfg?.sandbox?.name) {
        console.error("OpenShell is not configured yet. Run: arc402 openshell init");
        process.exit(1);
      }

      console.log("Syncing ARC-402 runtime into OpenShell...");
      try {
        const provisioned = provisionRuntimeToSandbox(
          cfg.sandbox.name,
          cfg.runtime?.remote_root ?? DEFAULT_RUNTIME_REMOTE_ROOT,
        );
        writeOpenShellConfig({
          sandbox: cfg.sandbox,
          runtime: {
            local_tarball: provisioned.tarballPath,
            remote_root: provisioned.remoteRoot,
            synced_at: new Date().toISOString(),
          },
        });
        console.log(`✓ Runtime synced to ${provisioned.remoteRoot}`);
      } catch (err) {
        console.error(`Runtime sync failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ── openshell status ───────────────────────────────────────────────────────
  openshell
    .command("status")
    .description("Show OpenShell integration status.")
    .action(() => {
      console.log("OpenShell Integration");
      console.log("─────────────────────");

      const line = (label: string, value: string) =>
        console.log(`${label.padEnd(14)}${value}`);

      // Installed?
      const shellPath = checkOpenShellInstalled();
      if (shellPath) {
        const vr = runCmd("openshell", ["--version"]);
        line("Installed:", `yes (${vr.stdout || "unknown version"})`);
      } else {
        line("Installed:", "no  ← run: arc402 openshell install");
      }

      // Docker
      const docker = detectDockerAccess();
      line("Docker:", docker.detail);

      // Sandbox
      if (shellPath) {
        const listR = runCmd("sh", ["-c",
          `openshell sandbox list 2>/dev/null | grep "${SANDBOX_NAME}"`
        ]);
        if (listR.ok && listR.stdout) {
          line("Sandbox:", `${SANDBOX_NAME} (found)`);
        } else {
          line("Sandbox:", `${SANDBOX_NAME} not found  ← run: arc402 openshell init`);
        }
      }

      // Policy file
      if (fs.existsSync(POLICY_FILE)) {
        line("Policy file:", `${POLICY_FILE} ✓`);
      } else {
        line("Policy file:", `${POLICY_FILE} (not found)`);
      }

      // Daemon mode + runtime bundle
      const openShellConfig = readOpenShellConfig();
      if (openShellConfig) {
        line("Daemon mode:", "OpenShell-owned (arc402 daemon start via provisioned sandbox runtime)");
        line("Runtime root:", openShellConfig.runtime?.remote_root ?? DEFAULT_RUNTIME_REMOTE_ROOT);
        line("Last sync:", openShellConfig.runtime?.synced_at ?? "unknown");

        try {
          const { configPath, host } = buildOpenShellSshConfig(openShellConfig.sandbox.name);
          const remoteDaemonEntry = path.posix.join(
            openShellConfig.runtime?.remote_root ?? DEFAULT_RUNTIME_REMOTE_ROOT,
            "dist/daemon/index.js",
          );
          const runtimeProbe = runCmd("ssh", ["-F", configPath, host, `test -f ${JSON.stringify(remoteDaemonEntry)} && echo present || echo missing`], { timeout: 60000 });
          line("Runtime sync:", runtimeProbe.ok && runtimeProbe.stdout.includes("present") ? "remote daemon bundle present ✓" : "remote daemon bundle missing");
        } catch {
          line("Runtime sync:", "could not verify remote bundle");
        }
      } else {
        line("Daemon mode:", "not configured for launch (run: arc402 openshell init)");
      }

      // Network policies
      const policy = loadPolicyFile();
      if (policy?.network_policies) {
        console.log("\nNetwork policy (allowed outbound):");
        for (const [, np] of Object.entries(policy.network_policies)) {
          for (const ep of np.endpoints) {
            console.log(`  ${ep.host.padEnd(30)} (${np.name})`);
          }
        }
        console.log("  [all others blocked]");
      }

      // Providers
      if (shellPath) {
        console.log("\nCredential providers:");
        const provListR = runCmd("openshell", ["provider", "list"]);
        if (provListR.ok && provListR.stdout) {
          const hasKey = provListR.stdout.includes("arc402-machine-key");
          const hasNotif = provListR.stdout.includes("arc402-notifications");
          console.log(`  arc402-machine-key     ${hasKey ? "✓" : "✗ (not found)"}`);
          console.log(`  arc402-notifications   ${hasNotif ? "✓" : "✗ (not found)"}`);
        } else {
          console.log("  (could not retrieve provider list)");
        }
      }
    });

  // ── openshell policy ───────────────────────────────────────────────────────
  const policyCmd = openshell
    .command("policy")
    .description("Manage the OpenShell network policy for the arc402-daemon sandbox.");

  // ── openshell policy add <name> <host> ────────────────────────────────────
  policyCmd
    .command("add <name> <host>")
    .description("Add a network endpoint to the policy and hot-reload the sandbox.")
    .action((name: string, host: string) => {
      const policy = loadPolicyFile();
      if (!policy) {
        console.error(`Policy file not found: ${POLICY_FILE}`);
        console.error("Run: arc402 openshell init");
        process.exit(1);
      }

      if (policy.network_policies[name]) {
        console.error(`Policy entry '${name}' already exists. Use a different name or remove it first.`);
        process.exit(1);
      }

      policy.network_policies[name] = {
        name,
        endpoints: [
          {
            host,
            port: 443,
            protocol: "rest",
            tls: "terminate",
            enforcement: "enforce",
            access: "read-write",
          },
        ],
        binaries: [
          { path: "/usr/bin/node" },
          { path: "/usr/local/bin/node" },
        ],
      };

      writePolicyFile(policy);
      hotReloadPolicy();
      console.log(`✓ ${host} added to daemon sandbox policy (hot-reloaded)`);
    });

  // ── openshell policy list ─────────────────────────────────────────────────
  policyCmd
    .command("list")
    .description("List all allowed outbound endpoints in the policy.")
    .action(() => {
      const policy = loadPolicyFile();
      if (!policy) {
        console.error(`Policy file not found: ${POLICY_FILE}`);
        console.error("Run: arc402 openshell init");
        process.exit(1);
      }

      const policies = Object.entries(policy.network_policies ?? {});
      if (policies.length === 0) {
        console.log("No network policies defined.");
        return;
      }

      console.log("Network policies (allowed outbound):");
      console.log();
      const col1 = 20;
      const col2 = 32;
      const col3 = 12;
      console.log(
        "Key".padEnd(col1) +
        "Host".padEnd(col2) +
        "Access".padEnd(col3) +
        "Name"
      );
      console.log("─".repeat(col1 + col2 + col3 + 24));

      for (const [key, np] of policies) {
        for (const ep of np.endpoints) {
          console.log(
            key.padEnd(col1) +
            ep.host.padEnd(col2) +
            ep.access.padEnd(col3) +
            np.name
          );
        }
      }
    });

  // ── openshell policy remove <name> ────────────────────────────────────────
  policyCmd
    .command("remove <name>")
    .description("Remove a named network policy entry and hot-reload the sandbox.")
    .action((name: string) => {
      const policy = loadPolicyFile();
      if (!policy) {
        console.error(`Policy file not found: ${POLICY_FILE}`);
        console.error("Run: arc402 openshell init");
        process.exit(1);
      }

      if (!policy.network_policies[name]) {
        console.error(`Policy entry '${name}' not found.`);
        console.error("Run: arc402 openshell policy list");
        process.exit(1);
      }

      const removedHost = policy.network_policies[name]?.endpoints[0]?.host ?? name;
      delete policy.network_policies[name];

      writePolicyFile(policy);
      hotReloadPolicy();
      console.log(`✓ ${removedHost} removed from daemon sandbox policy (hot-reloaded)`);
    });
}

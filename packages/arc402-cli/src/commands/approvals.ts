import { Command } from "commander";
import { loadConfig, saveConfig } from "../config";
import { c } from "../ui/colors";
import { getApprovalStatus } from "../approval/broker";
import { getApprovalConfig, setApprovalConfig } from "../approval/config";
import { runApprovalInit, sendApprovalTest } from "../approval/init";
import { listPasskeyApprovalRequests } from "../approval/passkey-requests";

export function registerApprovalCommands(program: Command): void {
  const approvals = program.command("approvals").description("Configure and test phone approval transport");

  approvals
    .command("init")
    .description("Guided setup for ARC-402 phone approval transport")
    .action(async () => {
      const config = await runApprovalInit();
      if (!config) {
        console.log(c.failure + " Setup cancelled");
        return;
      }

      const approval = getApprovalConfig(config);
      console.log("\n" + c.success + c.white(" Approval transport configured"));
      console.log(c.dim(`  Transport: ${approval.defaultTransport}`));
      if (approval.defaultTransport === "telegram_walletconnect") {
        console.log(c.dim(`  WalletConnect: ${approval.walletConnectProjectId ? "configured" : "missing"}`));
        console.log(c.dim(`  Telegram: ${approval.telegram?.chatId ? approval.telegram.chatId : "missing"}`));
      } else if (approval.defaultTransport === "telegram_passkey_link") {
        console.log(c.dim(`  Passkey URL: ${approval.passkey?.baseUrl ?? "missing"}`));
        console.log(c.dim(`  Telegram: ${approval.telegram?.chatId ? approval.telegram.chatId : "missing"}`));
      }

      if (approval.requireTestOnInit) {
        await sendApprovalTest(config);
        console.log(c.success + c.white(" Test message sent"));
      }
    });

  approvals
    .command("test")
    .description("Send a live approval transport test")
    .action(async () => {
      const config = loadConfig();
      await sendApprovalTest(config);
      console.log(c.success + c.white(" Approval test sent"));
    });

  approvals
    .command("status")
    .description("Show approval transport health")
    .action(async () => {
      const config = loadConfig();
      const approval = getApprovalConfig(config);
      const statuses = await getApprovalStatus(config);
      console.log(`Default transport: ${approval.defaultTransport}`);
      console.log(`Fallback transport: ${approval.fallbackTransport ?? "none"}`);
      console.log(`Require test on init: ${approval.requireTestOnInit ? "yes" : "no"}`);
      for (const status of statuses) {
        const mark = status.ok ? c.success : c.failure;
        console.log(`${mark} ${status.name}: ${status.detail ?? (status.ok ? "ok" : "not configured")}`);
      }

      const requests = listPasskeyApprovalRequests().slice(0, 5);
      if (requests.length > 0) {
        console.log("Recent passkey approval requests:");
        for (const request of requests) {
          console.log(`  ${request.approvalId}  ${request.status}  ${request.intent.ui.title}  expires ${request.expiresAt}`);
        }
      }
    });

  approvals
    .command("set-transport <name>")
    .description("Set default approval transport (telegram_walletconnect | telegram_passkey_link | local_qr)")
    .action((name: "telegram_walletconnect" | "telegram_passkey_link" | "local_qr") => {
      const config = loadConfig();
      const current = getApprovalConfig(config);
      setApprovalConfig(config, { ...current, defaultTransport: name });
      saveConfig(config);
      console.log(c.success + c.white(` Default transport set to ${name}`));
    });
}

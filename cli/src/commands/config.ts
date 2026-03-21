import { Command } from "commander";
import prompts from "prompts";
import chalk from "chalk";
import { Arc402Config, NETWORK_DEFAULTS, configExists, loadConfig, saveConfig, getSubdomainApi, getWcProjectId } from "../config";
import { c } from '../ui/colors';

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage ARC-402 CLI configuration");
  config.command("init").description("Interactive setup for ~/.arc402/config.json").action(async () => {
    const existing: Partial<Arc402Config> = configExists() ? loadConfig() : {};
    const answers = await prompts([
      { type: "select", name: "network", message: "Network", choices: [{ title: "Base Mainnet", value: "base-mainnet" }, { title: "Base Sepolia (testnet)", value: "base-sepolia" }], initial: existing.network === "base-sepolia" ? 1 : 0 },
    ]);

    if (!answers.network) { console.log(chalk.red("✗ Setup cancelled")); return; }

    const defaults = NETWORK_DEFAULTS[answers.network] ?? {};
    const cfg: Arc402Config = {
      network: answers.network,
      walletConnectProjectId: getWcProjectId(),
      rpcUrl: defaults.rpcUrl ?? "https://mainnet.base.org",
      trustRegistryAddress: defaults.trustRegistryAddress ?? "",
      agentRegistryAddress: defaults.agentRegistryV2Address ?? defaults.agentRegistryAddress,
      serviceAgreementAddress: defaults.serviceAgreementAddress,
      reputationOracleAddress: defaults.reputationOracleAddress,
      sponsorshipAttestationAddress: defaults.sponsorshipAttestationAddress,
      capabilityRegistryAddress: defaults.capabilityRegistryAddress,
      governanceAddress: defaults.governanceAddress,
      ...(existing.privateKey ? { privateKey: existing.privateKey } : {}),
      ...(existing.subdomainApi ? { subdomainApi: existing.subdomainApi } : {}),
      ...(existing.telegramBotToken ? { telegramBotToken: existing.telegramBotToken } : {}),
      ...(existing.telegramChatId ? { telegramChatId: existing.telegramChatId } : {}),
      ...(existing.telegramThreadId ? { telegramThreadId: existing.telegramThreadId } : {}),
      ...(existing.walletContractAddress ? { walletContractAddress: existing.walletContractAddress } : {}),
    };
    saveConfig(cfg);

    console.log();
    console.log(' ' + c.success + c.white(' Config saved'));
    console.log();
    console.log(chalk.dim("  Network          ") + chalk.white(answers.network === "base-mainnet" ? "Base Mainnet" : "Base Sepolia"));
    console.log(chalk.dim("  RPC              ") + chalk.white(cfg.rpcUrl!));
    console.log(chalk.dim("  Contracts        ") + chalk.white("All protocol addresses loaded"));
    console.log();
    console.log(chalk.dim("  Next: ") + chalk.white("arc402 wallet deploy"));
    console.log();
  });
  config.command("show").description("Print current config").action(() => {
    const cfg = loadConfig();
    console.log(JSON.stringify({ ...cfg, privateKey: cfg.privateKey ? "***" : undefined, subdomainApi: getSubdomainApi(cfg) }, null, 2));
  });
  config.command("set <key> <value>").description("Set a config value: arc402 config set <key> <value>").action((key: string, value: string) => {
    const BLOCKED_KEYS = ["privateKey", "guardianPrivateKey", "cdpPrivateKey", "machineKey"];
    const ALLOWED_KEYS = ["network", "rpcUrl", "walletContractAddress", "ownerAddress", "walletConnectProjectId", "subdomainApi", "telegramBotToken", "telegramChatId", "telegramThreadId"];
    if (BLOCKED_KEYS.includes(key)) {
      console.error(chalk.red("Cannot set sensitive keys via config set. Edit ~/.arc402/config.json directly."));
      process.exit(1);
    }
    if (!ALLOWED_KEYS.includes(key)) {
      console.error(chalk.red(`Unknown config key: ${key}. Allowed keys: ${ALLOWED_KEYS.join(", ")}`));
      process.exit(1);
    }
    const cfg = loadConfig();
    (cfg as unknown as Record<string, unknown>)[key] = value;
    saveConfig(cfg);
    console.log(' ' + c.success + c.white(` ${key} = ${value}`));
  });
}

import { Command } from "commander";
import { AgentRegistryClient } from "@arc402/sdk";
import { buildMetadata, uploadMetadata, decodeMetadata } from "@arc402/sdk";
import { loadConfig } from "../config";
import { getClient, requireSigner } from "../client";
import { formatDate, getTrustTier } from "../utils/format";
import prompts from "prompts";
import chalk from "chalk";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent registry operations (directory metadata; canonical capability claims live separately in CapabilityRegistry)");
  agent.command("register").requiredOption("--name <name>").requiredOption("--service-type <type>").option("--capability <caps>").option("--endpoint <url>", "Endpoint", "").option("--metadata-uri <uri>", "Metadata URI", "").option("--set-metadata", "Interactively build and upload metadata during registration").action(async (opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    let metadataUri = opts.metadataUri ?? "";
    if (opts.setMetadata) {
      metadataUri = await runSetMetadataWizard(opts.name, opts.capability ? opts.capability.split(",").map((v: string) => v.trim()) : []);
    }
    const { signer } = await requireSigner(config); const client = new AgentRegistryClient(config.agentRegistryAddress, signer);
    await client.register({ name: opts.name, serviceType: opts.serviceType, capabilities: opts.capability ? opts.capability.split(",").map((v: string) => v.trim()) : [], endpoint: opts.endpoint, metadataURI: metadataUri });
    console.log("registered");
    if (metadataUri) console.log(`metadata URI: ${metadataUri}`);
  });
  agent.command("update").requiredOption("--name <name>").requiredOption("--service-type <type>").option("--capability <caps>").option("--endpoint <url>", "Endpoint", "").option("--metadata-uri <uri>", "Metadata URI", "").action(async (opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { signer } = await requireSigner(config); const client = new AgentRegistryClient(config.agentRegistryAddress, signer);
    await client.update({ name: opts.name, serviceType: opts.serviceType, capabilities: opts.capability ? opts.capability.split(",").map((v: string) => v.trim()) : [], endpoint: opts.endpoint, metadataURI: opts.metadataUri });
    console.log("updated");
  });
  agent.command("set-metadata").description("Interactively build and upload ARC-402 agent metadata, then update the registry").action(async () => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { signer, address } = await requireSigner(config);
    const client = new AgentRegistryClient(config.agentRegistryAddress, signer);

    // Pre-fill from existing registration if available
    let existingName = "";
    let existingCaps: string[] = [];
    try {
      const existing = await client.getAgent(address);
      existingName = existing.name;
      existingCaps = existing.capabilities;
    } catch { /* not yet registered — that's fine */ }

    const uri = await runSetMetadataWizard(existingName, existingCaps);
    if (!uri) return;

    // Fetch current registration to preserve name/serviceType/endpoint
    let name = existingName; let serviceType = "general"; let endpoint = "";
    try {
      const a = await client.getAgent(address);
      name = a.name; serviceType = a.serviceType; endpoint = a.endpoint;
    } catch { /* not yet registered */ }

    await client.update({ name, serviceType, capabilities: existingCaps, endpoint, metadataURI: uri });
    console.log(chalk.green("✓ Metadata URI saved to registry"));
    console.log(`  ${uri}`);
  });
  agent.command("show-metadata <address>").description("Fetch and display metadata for any registered agent").action(async (address) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { provider } = await getClient(config);
    const client = new AgentRegistryClient(config.agentRegistryAddress, provider);
    const info = await client.getAgent(address);
    if (!info.metadataURI) {
      console.log(chalk.yellow("No metadata URI set for this agent."));
      return;
    }
    console.log(chalk.dim(`Fetching metadata from: ${info.metadataURI}\n`));
    let meta;
    try {
      meta = await decodeMetadata(info.metadataURI);
    } catch (err) {
      console.error(chalk.red(`Failed to fetch or parse metadata: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }
    console.log(chalk.bold("Agent Metadata") + chalk.dim(` (${meta.schema})`));
    if (meta.name)        console.log(`  name:        ${meta.name}`);
    if (meta.description) console.log(`  description: ${meta.description}`);
    if (meta.capabilities?.length) console.log(`  capabilities: ${meta.capabilities.join(", ")}`);
    if (meta.model) {
      console.log(`  model:`);
      if (meta.model.family)        console.log(`    family:        ${meta.model.family}`);
      if (meta.model.version)       console.log(`    version:       ${meta.model.version}`);
      if (meta.model.provider)      console.log(`    provider:      ${meta.model.provider}`);
      if (meta.model.contextWindow) console.log(`    contextWindow: ${meta.model.contextWindow}`);
      if (meta.model.multimodal !== undefined) console.log(`    multimodal:    ${meta.model.multimodal}`);
    }
    if (meta.training) {
      console.log(`  training:`);
      if (meta.training.disclosure)      console.log(`    disclosure:     ${meta.training.disclosure}`);
      if (meta.training.dataCutoff)      console.log(`    dataCutoff:     ${meta.training.dataCutoff}`);
      if (meta.training.specialisations?.length) console.log(`    specialisations: ${meta.training.specialisations.join(", ")}`);
      if (meta.training.synopsis)        console.log(`    synopsis:       ${meta.training.synopsis}`);
      console.log(`    verified:       ${meta.training.verified ?? false}`);
    }
    if (meta.pricing) {
      console.log(`  pricing: ${meta.pricing.base ?? "?"} ${meta.pricing.currency ?? ""} per ${meta.pricing.per ?? "job"}`);
    }
    if (meta.sla) {
      const parts: string[] = [];
      if (meta.sla.turnaroundHours)   parts.push(`${meta.sla.turnaroundHours}h turnaround`);
      if (meta.sla.availability)      parts.push(meta.sla.availability);
      if (meta.sla.maxConcurrentJobs) parts.push(`max ${meta.sla.maxConcurrentJobs} concurrent jobs`);
      if (parts.length) console.log(`  sla: ${parts.join(", ")}`);
    }
    if (meta.contact) {
      if (meta.contact.endpoint) console.log(`  contact.endpoint: ${meta.contact.endpoint}`);
      if (meta.contact.relay)    console.log(`  contact.relay:    ${meta.contact.relay}`);
    }
    if (meta.security) {
      console.log(`  security: injection=${meta.security.injectionProtection ?? false} envLeak=${meta.security.envLeakProtection ?? false} attested=${meta.security.attestedSecurityPolicy ?? false}`);
    }
  });
  agent.command("heartbeat").description("Submit self-reported heartbeat data (informational, not strong ranking-grade trust)").option("--latency-ms <n>", "Observed latency", "0").action(async (opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { signer } = await requireSigner(config); const client = new AgentRegistryClient(config.agentRegistryAddress, signer);
    await client.submitHeartbeat(Number(opts.latencyMs)); console.log("heartbeat submitted");
  });
  agent.command("heartbeat-policy").description("Configure self-reported heartbeat timing metadata").requiredOption("--interval <seconds>").requiredOption("--grace <seconds>").action(async (opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { signer } = await requireSigner(config); const client = new AgentRegistryClient(config.agentRegistryAddress, signer);
    await client.setHeartbeatPolicy(Number(opts.interval), Number(opts.grace)); console.log("heartbeat policy updated");
  });
  agent.command("info <address>").option("--json").action(async (address, opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { provider } = await getClient(config); const client = new AgentRegistryClient(config.agentRegistryAddress, provider);
    const [info, ops] = await Promise.all([client.getAgent(address), client.getOperationalMetrics(address)]);
    if (opts.json) return console.log(JSON.stringify({ ...info, registeredAt: Number(info.registeredAt), endpointChangedAt: Number(info.endpointChangedAt), endpointChangeCount: Number(info.endpointChangeCount), trustScore: Number(info.trustScore ?? 0n), operational: Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, Number(v)])) }, null, 2));
    console.log(`${info.name} ${info.wallet}\nservice=${info.serviceType}\ntrust=${Number(info.trustScore ?? 0n)} (${getTrustTier(Number(info.trustScore ?? 0n))})\nregistered=${formatDate(Number(info.registeredAt))}\nheartbeatCount=${Number(ops.heartbeatCount)} uptimeScore=${Number(ops.uptimeScore)} responseScore=${Number(ops.responseScore)}`);
  });
  agent.command("me").action(async () => { const config = loadConfig(); const { address } = await getClient(config); if (!address) throw new Error("No wallet configured"); await program.parseAsync([process.argv[0], process.argv[1], "agent", "info", address], { from: "user" }); });
}

async function runSetMetadataWizard(defaultName: string, defaultCapabilities: string[]): Promise<string> {
  console.log(chalk.bold("\nARC-402 Agent Metadata Wizard\n"));

  const answers = await prompts([
    { type: "text", name: "name", message: "Agent name:", initial: defaultName },
    { type: "text", name: "description", message: "Short description (what does this agent do?):" },
    { type: "text", name: "capabilities", message: "Capabilities (comma-separated, e.g. legal.patent-analysis.us.v1):", initial: defaultCapabilities.join(", ") },
    { type: "text", name: "modelFamily", message: "Model family (e.g. claude, gpt, gemini, llama — leave blank to omit):" },
    { type: "text", name: "modelVersion", message: "Model version (e.g. claude-sonnet-4-6 — leave blank to omit):" },
    { type: "text", name: "modelProvider", message: "Model provider (e.g. anthropic — leave blank to omit):" },
    { type: "text", name: "contactEndpoint", message: "Contact endpoint URL (leave blank to omit):" },
    { type: "confirm", name: "injectionProtection", message: "Does this agent have prompt injection protection?", initial: false },
    { type: "confirm", name: "envLeakProtection", message: "Does this agent have env/key leak protection in its instructions?", initial: false },
  ]);

  if (!answers.name) {
    console.log(chalk.dim("Cancelled."));
    return "";
  }

  const capabilities = answers.capabilities
    ? answers.capabilities.split(",").map((v: string) => v.trim()).filter(Boolean)
    : [];

  const meta = buildMetadata({
    name: answers.name || undefined,
    description: answers.description || undefined,
    capabilities: capabilities.length ? capabilities : undefined,
    model: (answers.modelFamily || answers.modelVersion || answers.modelProvider) ? {
      family:   answers.modelFamily   || undefined,
      version:  answers.modelVersion  || undefined,
      provider: answers.modelProvider || undefined,
    } : undefined,
    contact: answers.contactEndpoint ? { endpoint: answers.contactEndpoint } : undefined,
    security: {
      injectionProtection: answers.injectionProtection,
      envLeakProtection:   answers.envLeakProtection,
    },
  });

  const pinataJwt = process.env["PINATA_JWT"];
  if (!pinataJwt) {
    console.log(chalk.dim("\nNo PINATA_JWT env var found — metadata will be stored as a data URI."));
    console.log(chalk.dim("To pin to IPFS: export PINATA_JWT=<your-jwt> and re-run.\n"));
  } else {
    console.log(chalk.dim("\nUploading to IPFS via Pinata…"));
  }

  const uri = await uploadMetadata(meta, pinataJwt);
  console.log(chalk.green(`✓ Metadata URI: ${uri}`));
  return uri;
}

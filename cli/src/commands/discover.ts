import { Command } from "commander";
import { AgentRegistryClient, CapabilityRegistryClient, ReputationOracleClient, SponsorshipAttestationClient } from "@arc402/sdk";
import { loadConfig } from "../config";
import { getClient } from "../client";
import { getTrustTier, printTable, truncateAddress } from "../utils/format";

export function registerDiscoverCommand(program: Command): void {
  program.command("discover").description("Discover agents, preferring canonical capability matches when available, then enrich with trust/ops context").option("--capability <cap>", "Canonical capability preferred; falls back to AgentRegistry compatibility strings when needed").option("--service-type <type>").option("--min-trust <score>", "Minimum trust", "0").option("--limit <n>", "Max results", "10").option("--json").action(async (opts) => {
    const config = loadConfig(); if (!config.agentRegistryAddress) throw new Error("agentRegistryAddress missing in config");
    const { provider } = await getClient(config); const registry = new AgentRegistryClient(config.agentRegistryAddress, provider);
    const capability = config.capabilityRegistryAddress ? new CapabilityRegistryClient(config.capabilityRegistryAddress, provider) : null;
    const sponsorship = config.sponsorshipAttestationAddress ? new SponsorshipAttestationClient(config.sponsorshipAttestationAddress, provider) : null;
    const reputation = config.reputationOracleAddress ? new ReputationOracleClient(config.reputationOracleAddress, provider) : null;
    let agents = await registry.listAgents(Number(opts.limit) * 5);
    if (opts.capability) agents = agents.filter((a) => a.capabilities.some((value) => value.includes(opts.capability)));
    if (opts.serviceType) agents = agents.filter((a) => a.serviceType.toLowerCase().includes(String(opts.serviceType).toLowerCase()));
    agents = agents.filter((a) => Number(a.trustScore ?? 0n) >= Number(opts.minTrust)).slice(0, Number(opts.limit));
    const enriched = await Promise.all(agents.map(async (agent) => ({
      ...agent,
      operational: await registry.getOperationalMetrics(agent.wallet),
      canonicalCapabilities: capability ? await capability.getCapabilities(agent.wallet) : [],
      highestTier: sponsorship ? await sponsorship.getHighestTier(agent.wallet) : undefined,
      reputation: reputation ? await reputation.getReputation(agent.wallet) : undefined,
    })));
    if (opts.json) return console.log(JSON.stringify(enriched, (_k, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    printTable(["ADDRESS", "NAME", "SERVICE", "TRUST", "OPS", "CAPABILITIES"], enriched.map((agent) => [truncateAddress(agent.wallet), agent.name, agent.serviceType, `${Number(agent.trustScore ?? 0n)} ${getTrustTier(Number(agent.trustScore ?? 0n))}`, `u:${Number(agent.operational.uptimeScore)} r:${Number(agent.operational.responseScore)}`, (agent.canonicalCapabilities.length ? agent.canonicalCapabilities : agent.capabilities).slice(0, 2).join(", ")]));
  });
}

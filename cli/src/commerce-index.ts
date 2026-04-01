const COMMERCE_SUBGRAPH_URL =
  process.env.ARC402_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1744310/arc-402/v0.3.0";

type AgreementRecord = {
  id: string;
  provider: string;
  serviceType: string;
  price: string;
  state: string;
  updatedAt: string;
};

type AgentRecord = {
  id: string;
  name: string;
  serviceType: string;
  active: boolean;
  trustScore?: { globalScore: string } | null;
};

type AgentCapabilityRecord = {
  capability: string;
  active: boolean;
  agent: {
    id: string;
    name: string;
    serviceType: string;
    active: boolean;
    trustScore?: { globalScore: string } | null;
  };
};

type X402PaymentRecord = {
  amount: string;
  requestUrl: string;
  timestamp: string;
};

interface CommerceIndexQueryResult {
  agreements?: AgreementRecord[];
  agentCapabilities?: AgentCapabilityRecord[];
  agents?: AgentRecord[];
  x402Payments?: X402PaymentRecord[];
}

export interface CapabilityIndexEntry {
  capability: string;
  agreements: number;
  avgPriceWei: bigint;
  avgPriceEth: number;
  providerCount: number;
  recentAgreements: number;
  previousAgreements: number;
  x402Payments: number;
  x402VolumeWei: bigint;
  trendPct: number;
  trendLabel: string;
}

export interface CapabilityPricePoint {
  agreementId: string;
  provider: string;
  priceWei: bigint;
  updatedAt: number;
}

export interface CapabilityPriceSnapshot {
  capability: string;
  avg30dWei: bigint;
  avg30dEth: number;
  avg7dWei: bigint;
  avg7dEth: number;
  deltaPct: number;
  floorWei: bigint;
  floorEth: number;
  ceilingWei: bigint;
  ceilingEth: number;
  totalVolumeWei: bigint;
  totalVolumeEth: number;
  agreements: number;
  providers: number;
  lastFive: CapabilityPricePoint[];
}

function q(value: string): string {
  return JSON.stringify(value);
}

async function subgraphQuery<T>(query: string): Promise<T> {
  const response = await fetch(COMMERCE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Unknown subgraph error");
  }

  return (json.data ?? {}) as T;
}

function toTimestampDaysAgo(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
}

function parseWei(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function weiToEthNumber(value: bigint): number {
  return Number(value) / 1e18;
}

function averageWei(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const total = values.reduce((acc, entry) => acc + entry, 0n);
  return total / BigInt(values.length);
}

function trendLabel(entry: { agreements: number; trendPct: number; providerCount: number }): string {
  if (entry.agreements >= 5 && entry.providerCount <= 2) return "Scarce";
  if (entry.trendPct >= 50) return "Rising";
  if (entry.agreements >= 8) return "High demand";
  if (entry.trendPct <= -20) return "Cooling";
  return "Stable";
}

export async function fetchCapabilityIndex(days = 30): Promise<CapabilityIndexEntry[]> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = toTimestampDaysAgo(days);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60;

  const data = await subgraphQuery<CommerceIndexQueryResult>(`{
    agreements(
      first: 1000
      orderBy: updatedAt
      orderDirection: desc
      where: { updatedAt_gte: ${q(String(windowStart))}, state: ${q("FULFILLED")} }
    ) {
      id
      provider
      serviceType
      price
      state
      updatedAt
    }
    agentCapabilities(
      first: 1000
      where: { active: true }
    ) {
      capability
      active
      agent {
        id
        name
        serviceType
        active
        trustScore {
          globalScore
        }
      }
    }
    agents(
      first: 1000
      where: { active: true }
    ) {
      id
      name
      serviceType
      active
      trustScore {
        globalScore
      }
    }
    x402Payments(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_gte: ${q(String(windowStart))} }
    ) {
      amount
      requestUrl
      timestamp
    }
  }`);

  const agreements = data.agreements ?? [];
  const capabilityClaims = data.agentCapabilities ?? [];
  const activeAgents = data.agents ?? [];
  const x402Payments = data.x402Payments ?? [];

  const providerCounts = new Map<string, Set<string>>();
  for (const claim of capabilityClaims) {
    if (!claim.active || !claim.agent?.active) continue;
    const providers = providerCounts.get(claim.capability) ?? new Set<string>();
    providers.add(claim.agent.id.toLowerCase());
    providerCounts.set(claim.capability, providers);
  }
  for (const agent of activeAgents) {
    if (!agent.active || !agent.serviceType) continue;
    const providers = providerCounts.get(agent.serviceType) ?? new Set<string>();
    providers.add(agent.id.toLowerCase());
    providerCounts.set(agent.serviceType, providers);
  }

  const x402ByCapability = new Map<string, { count: number; volumeWei: bigint }>();
  for (const payment of x402Payments) {
    let capability = "";
    try {
      const parsed = new URL(payment.requestUrl);
      capability =
        parsed.searchParams.get("capability") ??
        parsed.pathname.split("/").filter(Boolean).pop() ??
        "";
    } catch {
      capability = "";
    }
    if (!capability) continue;
    const current = x402ByCapability.get(capability) ?? { count: 0, volumeWei: 0n };
    current.count += 1;
    current.volumeWei += parseWei(payment.amount);
    x402ByCapability.set(capability, current);
  }

  const grouped = new Map<string, AgreementRecord[]>();
  for (const agreement of agreements) {
    if (!agreement.serviceType) continue;
    const bucket = grouped.get(agreement.serviceType) ?? [];
    bucket.push(agreement);
    grouped.set(agreement.serviceType, bucket);
  }

  return [...grouped.entries()]
    .map(([capability, rows]) => {
      const prices = rows.map((row) => parseWei(row.price));
      const recentAgreements = rows.filter((row) => Number(row.updatedAt) >= sevenDaysAgo).length;
      const previousAgreements = rows.filter((row) => {
        const ts = Number(row.updatedAt);
        return ts >= fourteenDaysAgo && ts < sevenDaysAgo;
      }).length;
      const trendPct =
        previousAgreements === 0
          ? recentAgreements > 0
            ? 100
            : 0
          : ((recentAgreements - previousAgreements) / previousAgreements) * 100;
      const x402 = x402ByCapability.get(capability) ?? { count: 0, volumeWei: 0n };
      const entry: CapabilityIndexEntry = {
        capability,
        agreements: rows.length,
        avgPriceWei: averageWei(prices),
        avgPriceEth: weiToEthNumber(averageWei(prices)),
        providerCount: providerCounts.get(capability)?.size ?? 0,
        recentAgreements,
        previousAgreements,
        x402Payments: x402.count,
        x402VolumeWei: x402.volumeWei,
        trendPct,
        trendLabel: "Stable",
      };
      entry.trendLabel = trendLabel(entry);
      return entry;
    })
    .sort((a, b) => {
      if (b.recentAgreements !== a.recentAgreements) return b.recentAgreements - a.recentAgreements;
      return b.avgPriceEth - a.avgPriceEth;
    });
}

export async function fetchCapabilityPriceSnapshot(
  capability: string,
  days = 30
): Promise<CapabilityPriceSnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = toTimestampDaysAgo(days);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;

  const data = await subgraphQuery<CommerceIndexQueryResult>(`{
    agreements(
      first: 1000
      orderBy: updatedAt
      orderDirection: desc
      where: {
        updatedAt_gte: ${q(String(windowStart))}
        state: ${q("FULFILLED")}
        serviceType: ${q(capability)}
      }
    ) {
      id
      provider
      serviceType
      price
      state
      updatedAt
    }
    agentCapabilities(
      first: 1000
      where: { active: true, capability: ${q(capability)} }
    ) {
      capability
      active
      agent {
        id
        name
        serviceType
        active
        trustScore {
          globalScore
        }
      }
    }
    agents(
      first: 1000
      where: { active: true, serviceType: ${q(capability)} }
    ) {
      id
      name
      serviceType
      active
      trustScore {
        globalScore
      }
    }
  }`);

  const agreements = (data.agreements ?? []).map((agreement) => ({
    agreementId: agreement.id,
    provider: agreement.provider,
    priceWei: parseWei(agreement.price),
    updatedAt: Number(agreement.updatedAt),
  }));

  const prices = agreements.map((entry) => entry.priceWei);
  const last7d = agreements.filter((entry) => entry.updatedAt >= sevenDaysAgo);
  const avg30dWei = averageWei(prices);
  const avg7dWei = averageWei(last7d.map((entry) => entry.priceWei));
  const floorWei = prices.length > 0 ? prices.reduce((min, value) => (value < min ? value : min), prices[0]) : 0n;
  const ceilingWei = prices.length > 0 ? prices.reduce((max, value) => (value > max ? value : max), prices[0]) : 0n;
  const totalVolumeWei = prices.reduce((acc, value) => acc + value, 0n);
  const providers = new Set<string>();

  for (const claim of data.agentCapabilities ?? []) {
    if (claim.active && claim.agent?.active) providers.add(claim.agent.id.toLowerCase());
  }
  for (const agent of data.agents ?? []) {
    if (agent.active) providers.add(agent.id.toLowerCase());
  }
  for (const agreement of agreements) {
    providers.add(agreement.provider.toLowerCase());
  }

  const avg30dEth = weiToEthNumber(avg30dWei);
  const avg7dEth = weiToEthNumber(avg7dWei);
  const deltaPct = avg30dEth === 0 ? 0 : ((avg7dEth - avg30dEth) / avg30dEth) * 100;

  return {
    capability,
    avg30dWei,
    avg30dEth,
    avg7dWei,
    avg7dEth,
    deltaPct,
    floorWei,
    floorEth: weiToEthNumber(floorWei),
    ceilingWei,
    ceilingEth: weiToEthNumber(ceilingWei),
    totalVolumeWei,
    totalVolumeEth: weiToEthNumber(totalVolumeWei),
    agreements: agreements.length,
    providers: providers.size,
    lastFive: agreements.slice(0, 5),
  };
}

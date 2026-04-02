// ARC-402 Spec 23: Agent Metadata Standard

export const AGENT_METADATA_SCHEMA = "arc402.agent-metadata.v1";

export interface AgentMetadataModel {
  family?: string;
  version?: string;
  provider?: string;
  contextWindow?: number;
  multimodal?: boolean;
}

export interface AgentMetadataTraining {
  disclosure?: string;
  dataCutoff?: string;
  specialisations?: string[];
  synopsis?: string;
  verified?: boolean;
  attestations?: unknown[];
}

export interface AgentMetadataPricing {
  base?: string;
  token?: string;
  currency?: string;
  per?: string;
}

export interface AgentMetadataSla {
  turnaroundHours?: number;
  availability?: string;
  maxConcurrentJobs?: number;
}

export interface AgentMetadataContact {
  endpoint?: string;
  relay?: string;
  relayFallbacks?: string[];
}

export interface AgentMetadataSecurity {
  injectionProtection?: boolean;
  envLeakProtection?: boolean;
  attestedSecurityPolicy?: boolean;
}

export interface AgentMetadata {
  schema: string;
  name?: string;
  description?: string;
  capabilities?: string[];
  model?: AgentMetadataModel;
  training?: AgentMetadataTraining;
  pricing?: AgentMetadataPricing;
  sla?: AgentMetadataSla;
  contact?: AgentMetadataContact;
  security?: AgentMetadataSecurity;
}

export function validateMetadata(obj: unknown): AgentMetadata {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("metadata must be an object");
  }
  const m = obj as Record<string, unknown>;
  if (typeof m["schema"] !== "string") {
    throw new Error("metadata.schema must be a string");
  }
  if (m["schema"] !== AGENT_METADATA_SCHEMA) {
    throw new Error(`metadata.schema must be "${AGENT_METADATA_SCHEMA}", got "${m["schema"]}"`);
  }
  if (m["name"] !== undefined && typeof m["name"] !== "string") {
    throw new Error("metadata.name must be a string");
  }
  if (m["description"] !== undefined && typeof m["description"] !== "string") {
    throw new Error("metadata.description must be a string");
  }
  if (m["capabilities"] !== undefined) {
    if (!Array.isArray(m["capabilities"]) || !m["capabilities"].every((c: unknown) => typeof c === "string")) {
      throw new Error("metadata.capabilities must be a string array");
    }
  }
  return m as unknown as AgentMetadata;
}

export function buildMetadata(input: Partial<AgentMetadata>): AgentMetadata {
  const meta: AgentMetadata = {
    schema: AGENT_METADATA_SCHEMA,
    ...input,
  };
  if (meta.training) {
    meta.training = {
      verified: false,
      attestations: [],
      ...meta.training,
    };
  }
  if (meta.security) {
    meta.security = {
      attestedSecurityPolicy: false,
      ...meta.security,
    };
  }
  return meta;
}

export function encodeMetadata(metadata: AgentMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

function resolveIpfsUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

export async function decodeMetadata(uri: string): Promise<AgentMetadata> {
  if (uri.startsWith("data:")) {
    // data:application/json;base64,<b64> or data:application/json,<encoded>
    const commaIdx = uri.indexOf(",");
    if (commaIdx === -1) throw new Error("malformed data URI");
    const header = uri.slice(5, commaIdx);
    const payload = uri.slice(commaIdx + 1);
    const isBase64 = header.includes(";base64");
    const json = isBase64 ? Buffer.from(payload, "base64").toString("utf-8") : decodeURIComponent(payload);
    return validateMetadata(JSON.parse(json));
  }
  const url = resolveIpfsUri(uri);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch metadata from ${url}: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return validateMetadata(json);
}

export async function uploadMetadata(metadata: AgentMetadata, pinataJwt?: string): Promise<string> {
  if (pinataJwt) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pinataJwt}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: { name: `arc402-agent-metadata-${metadata.name ?? "unknown"}` },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata upload failed: ${res.status} ${text}`);
    }
    const data = await res.json() as { IpfsHash: string };
    return `ipfs://${data.IpfsHash}`;
  }
  // Fallback: data URI (no IPFS credentials configured)
  const b64 = Buffer.from(encodeMetadata(metadata), "utf-8").toString("base64");
  return `data:application/json;base64,${b64}`;
}

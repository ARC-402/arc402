export interface Env {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  RATE_LIMIT_KV?: KVNamespace;
  BASE_RPC_URL?: string;
}

// --- Constants ---

const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "mail", "ftp", "admin", "root", "dev", "staging",
]);

const AGENT_REGISTRY_ADDRESS = "0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865";
const DEFAULT_BASE_RPC_URL = "https://base.llamarpc.com";

// In-memory rate limit fallback (per isolate, resets on cold start)
const inMemoryRateLimit = new Map<string, { count: number; resetAt: number }>();

// --- CORS ---

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsResponse(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

function json(data: unknown, status = 200): Response {
  return corsResponse(JSON.stringify(data), status);
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// --- Validation ---

function isValidSubdomain(subdomain: string): boolean {
  if (subdomain.length < 3 || subdomain.length > 32) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain) && !/^[a-z0-9]$/.test(subdomain)) return false;
  if (RESERVED_SUBDOMAINS.has(subdomain)) return false;
  return true;
}

function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidTunnelTarget(url: string): boolean {
  return url.startsWith("https://");
}

// --- Rate limiting ---

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function checkRateLimit(ip: string, kv?: KVNamespace): Promise<boolean> {
  const key = `rl:${ip}`;
  const now = Date.now();

  if (kv) {
    const raw = await kv.get(key, "json") as { count: number; resetAt: number } | null;
    if (!raw || now > raw.resetAt) {
      await kv.put(key, JSON.stringify({ count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }), {
        expirationTtl: 3600,
      });
      return true;
    }
    if (raw.count >= RATE_LIMIT_MAX) return false;
    await kv.put(key, JSON.stringify({ count: raw.count + 1, resetAt: raw.resetAt }), {
      expirationTtl: Math.ceil((raw.resetAt - now) / 1000),
    });
    return true;
  }

  // Fallback: in-memory
  const entry = inMemoryRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    inMemoryRateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- Ethereum / AgentRegistry ---

function encodeIsRegisteredCall(address: string): string {
  // Function selector for isRegistered(address): keccak256 first 4 bytes
  // isRegistered(address) => 0x85b68445
  const selector = "0x85b68445";
  // ABI-encode the address: pad to 32 bytes
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, "0");
  return selector + paddedAddress;
}

async function isWalletRegistered(walletAddress: string, rpcUrl: string): Promise<boolean> {
  const callData = encodeIsRegisteredCall(walletAddress);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        { to: AGENT_REGISTRY_ADDRESS, data: callData },
        "latest",
      ],
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const result = await response.json() as { result?: string; error?: { message: string } };

  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }

  // Result is a 32-byte bool: last byte non-zero = true
  const hex = result.result ?? "0x";
  return hex !== "0x" && BigInt(hex) !== 0n;
}

// --- Cloudflare DNS API ---

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

async function getDnsRecord(
  zoneId: string,
  token: string,
  name: string,
): Promise<{ id: string } | null> {
  const res = await fetch(
    `${CF_API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json() as { result: Array<{ id: string }> };
  return data.result?.[0] ?? null;
}

async function createCnameRecord(
  zoneId: string,
  token: string,
  subdomain: string,
  target: string,
): Promise<void> {
  const fqdn = `${subdomain}.arc402.xyz`;
  const existing = await getDnsRecord(zoneId, token, fqdn);

  // First-come-first-served: once registered, a subdomain cannot be overwritten
  if (existing) {
    throw new Error(`Subdomain '${subdomain}' is already registered`);
  }

  const body = JSON.stringify({
    type: "CNAME",
    name: subdomain,
    content: target,
    proxied: true,
    ttl: 1,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DNS API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { success: boolean; errors: Array<{ message: string }> };
  if (!data.success) {
    throw new Error(`DNS API failed: ${data.errors.map((e) => e.message).join(", ")}`);
  }
}

async function checkSubdomainExists(zoneId: string, token: string, subdomain: string): Promise<boolean> {
  const fqdn = `${subdomain}.arc402.xyz`;
  const record = await getDnsRecord(zoneId, token, fqdn);
  return record !== null;
}

// --- Route handlers ---

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const allowed = await checkRateLimit(ip, env.RATE_LIMIT_KV);
  if (!allowed) {
    return err("Rate limit exceeded: max 5 registrations per hour", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { subdomain, walletAddress, tunnelTarget } = body as Record<string, unknown>;

  if (typeof subdomain !== "string" || !isValidSubdomain(subdomain.toLowerCase())) {
    return err(
      "Invalid subdomain: must be 3-32 alphanumeric/hyphen characters, no reserved names",
    );
  }
  if (typeof walletAddress !== "string" || !isValidEthAddress(walletAddress)) {
    return err("Invalid walletAddress: must be a valid Ethereum address (0x...)");
  }
  if (typeof tunnelTarget !== "string" || !isValidTunnelTarget(tunnelTarget)) {
    return err("Invalid tunnelTarget: must start with https://");
  }

  const normalizedSubdomain = subdomain.toLowerCase();
  const ownerKey = `owner:${normalizedSubdomain}`;

  // Check ownership record — block if taken by a different wallet
  if (env.RATE_LIMIT_KV) {
    const existingOwner = await env.RATE_LIMIT_KV.get(ownerKey);
    if (existingOwner && existingOwner.toLowerCase() !== walletAddress.toLowerCase()) {
      return err("Subdomain is already registered by another wallet", 409);
    }
  }

  // Verify wallet on Base mainnet
  const rpcUrl = env.BASE_RPC_URL ?? DEFAULT_BASE_RPC_URL;
  let registered: boolean;
  try {
    registered = await isWalletRegistered(walletAddress, rpcUrl);
  } catch (e) {
    return err(`Failed to verify wallet registration: ${(e as Error).message}`, 502);
  }

  if (!registered) {
    return err("Wallet is not registered in AgentRegistry on Base mainnet", 403);
  }

  // Strip https:// to get hostname for CNAME content
  const targetHostname = tunnelTarget.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Create or update DNS record
  // — new subdomain: POST a fresh CNAME
  // — same wallet updating their tunnel: PUT to update the existing record
  try {
    const fqdn = `${normalizedSubdomain}.arc402.xyz`;
    const existing = await getDnsRecord(env.CLOUDFLARE_ZONE_ID, env.CLOUDFLARE_API_TOKEN, fqdn);

    if (existing) {
      // Only the original wallet can reach this point (ownership check above)
      await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${existing.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "CNAME", name: normalizedSubdomain, content: targetHostname, proxied: true, ttl: 1 }),
      });
    } else {
      await createCnameRecord(env.CLOUDFLARE_ZONE_ID, env.CLOUDFLARE_API_TOKEN, normalizedSubdomain, targetHostname);
    }
  } catch (e) {
    return err(`Failed to create DNS record: ${(e as Error).message}`, 502);
  }

  // Write ownership record (no expiry — permanent)
  if (env.RATE_LIMIT_KV) {
    await env.RATE_LIMIT_KV.put(ownerKey, walletAddress);
  }

  return json({ subdomain: `${normalizedSubdomain}.arc402.xyz`, status: "active" }, 200);
}

async function handleCheck(subdomain: string, env: Env): Promise<Response> {
  const normalized = subdomain.toLowerCase();
  if (!isValidSubdomain(normalized)) {
    return json({ available: false, reason: "invalid" });
  }
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return json({ available: false, reason: "reserved" });
  }

  let exists: boolean;
  try {
    exists = await checkSubdomainExists(env.CLOUDFLARE_ZONE_ID, env.CLOUDFLARE_API_TOKEN, normalized);
  } catch (e) {
    return err(`Failed to check subdomain: ${(e as Error).message}`, 502);
  }

  return json({ available: !exists });
}

// --- Main handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const path = url.pathname;

    if (path === "/health" && method === "GET") {
      return json({ ok: true });
    }

    if (path === "/register" && method === "POST") {
      return handleRegister(request, env);
    }

    const checkMatch = path.match(/^\/check\/([^/]+)$/);
    if (checkMatch && method === "GET") {
      return handleCheck(checkMatch[1], env);
    }

    return err("Not found", 404);
  },
} satisfies ExportedHandler<Env>;

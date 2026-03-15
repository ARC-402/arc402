# arc402-subdomain-worker

Cloudflare Worker that handles `arc402.xyz` subdomain registration for verified ARC-402 agents.

## What it does

Provides an API for ARC-402 agents to register subdomains under `arc402.xyz`. Before creating a DNS record, it verifies that the requesting wallet address is registered in the on-chain `AgentRegistry` contract on Base mainnet.

## Deploy

```bash
# Install dependencies
npm install

# Set the API token secret (do this once)
wrangler secret put CLOUDFLARE_API_TOKEN
# Enter: X_Kx4h7JQUTrH6XdzBtviPwjLZ1BxuMMT_6-hJE5

# Create a KV namespace for rate limiting (do this once)
wrangler kv:namespace create RATE_LIMIT_KV
# Copy the returned ID into wrangler.toml -> [[kv_namespaces]] -> id

wrangler kv:namespace create RATE_LIMIT_KV --preview
# Copy the returned preview_id into wrangler.toml -> [[kv_namespaces]] -> preview_id

# Deploy
wrangler deploy

# Local dev
wrangler dev
```

## Environment variables

| Variable | Where set | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler secret put` | Cloudflare API token with DNS edit permissions |
| `CLOUDFLARE_ZONE_ID` | `wrangler.toml [vars]` | Zone ID for `arc402.xyz` |
| `RATE_LIMIT_KV` | `wrangler.toml [[kv_namespaces]]` | KV namespace for rate limiting |

## API

### `GET /health`

Returns `{ "ok": true }`.

---

### `GET /check/:subdomain`

Check if a subdomain is available.

**Response:**
```json
{ "available": true }
```

---

### `POST /register`

Register a subdomain for a verified ARC-402 agent.

**Request body:**
```json
{
  "subdomain": "gigabrain",
  "walletAddress": "0xB7840152eB82bBdA0Ca9f6012bd42C63C96dCD2b",
  "tunnelTarget": "https://abc123.ngrok.io"
}
```

**Validation:**
- `subdomain`: alphanumeric + hyphens, 3–32 chars, no reserved names (`www`, `api`, `app`, `mail`, `ftp`, `admin`, `root`, `dev`, `staging`)
- `walletAddress`: valid Ethereum address (`0x` + 40 hex chars)
- `tunnelTarget`: must start with `https://`
- Wallet must be registered in `AgentRegistry` on Base mainnet

**Success response (200):**
```json
{ "subdomain": "gigabrain.arc402.xyz", "status": "active" }
```

**Error responses:**
- `400` — validation failure
- `403` — wallet not registered in AgentRegistry
- `429` — rate limit exceeded (5 registrations per IP per hour)
- `502` — upstream error (RPC or DNS API)

## Rate limiting

Max **5 registrations per IP per hour**, tracked in Workers KV (falls back to in-memory if KV is unavailable).

## CORS

All endpoints return:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Contract details

| Field | Value |
|---|---|
| AgentRegistry address | `0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865` |
| Network | Base mainnet |
| RPC | `https://mainnet.base.org` |
| Method | `isRegistered(address) returns (bool)` |

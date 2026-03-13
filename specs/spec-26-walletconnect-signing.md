# Spec 26 — WalletConnect CLI Integration + Telegram Signing Page

**Status:** QUEUED  
**Priority:** LAUNCH BLOCKER — must ship before mainnet  
**Rationale:** Without this, the owner key lives on disk. Trust depends on the human being in the loop for privileged operations. WalletConnect puts the owner key on the human's phone — the only place it should be.

---

## Overview

Two deliverables:

1. **CLI WalletConnect integration** — `arc402 wallet deploy` shows a QR code. User scans with phone wallet. Phone signs the deployment. Owner key never touches the machine.

2. **Telegram signing page** — A hosted web page at a stable URL. When GigaBrain sends an action link in Telegram, the user taps it, the page opens on their phone, passkey/biometric triggers, transaction is signed and broadcast. Enables remote policy changes and emergency unfreezing from anywhere.

---

## Deliverable 1: CLI WalletConnect Integration

### Package

Use `@walletconnect/sign-client` (dapp-side SDK). **Not** `@walletconnect/web3wallet` (that is the wallet-side SDK).

```bash
npm install @walletconnect/sign-client qrcode-terminal
```

Requires a WalletConnect Cloud project ID (free tier at cloud.walletconnect.com).
Add to config: `walletConnectProjectId` field in `Arc402Config`.

### Implementation: src/walletconnect.ts

```typescript
import { SignClient } from "@walletconnect/sign-client";
import qrcode from "qrcode-terminal";

export async function requestPhoneWalletSignature(
  projectId: string,
  chainId: number, // 84532 for base-sepolia, 8453 for base-mainnet
  unsignedTx: TransactionRequest,
  prompt: string
): Promise<string> {
  const client = await SignClient.init({
    projectId,
    metadata: {
      name: "ARC-402 CLI",
      description: "ARC-402 Protocol CLI",
      url: "https://arc402.xyz",
      icons: []
    }
  });

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction", "personal_sign"],
        chains: [`eip155:${chainId}`],
        events: ["accountsChanged"]
      }
    }
  });

  if (!uri) throw new Error("Failed to create WalletConnect session");

  console.log(`\n${prompt}`);
  console.log("Scan with MetaMask, Rabby, or Coinbase Wallet:\n");
  qrcode.generate(uri, { small: true });
  console.log("\nWaiting for approval...");

  const session = await approval();
  const account = session.namespaces.eip155.accounts[0].split(":")[2];

  const txHash = await client.request<string>({
    topic: session.topic,
    chainId: `eip155:${chainId}`,
    request: {
      method: "eth_sendTransaction",
      params: [{ ...unsignedTx, from: account }]
    }
  });

  await client.disconnect({ topic: session.topic, reason: { code: 0, message: "done" } });
  return txHash;
}
```

### Session Health Check

WalletConnect v2 sessions have a 7-day TTL. For persistent sessions (e.g., if the CLI maintains a session across invocations):
- Store session topic + expiry in `~/.arc402/wc-session.json`
- On startup, check if session is expired (within 24h of expiry = warn and reconnect)
- Auto-reconnect before TTL expires

### Update: arc402 wallet deploy

Replace current deploy flow:

```typescript
// OLD: signs directly with private key from config
// NEW: use WalletConnect to get phone wallet signature

async function walletDeploy(config: Arc402Config) {
  const chainId = config.network === "base-mainnet" ? 8453 : 84532;
  
  // Build the deployment transaction (WalletFactory.createWallet)
  const factory = new ethers.Contract(config.walletFactoryAddress, FACTORY_ABI, provider);
  const deployData = factory.interface.encodeFunctionData("createWallet", [/* owner = phone wallet */]);
  
  const txHash = await requestPhoneWalletSignature(
    config.walletConnectProjectId,
    chainId,
    {
      to: config.walletFactoryAddress,
      data: deployData,
      value: "0x0"
    },
    "Approve ARC402Wallet deployment — you will be set as owner"
  );

  // Wait for deployment to confirm, extract contract address from logs
  const receipt = await provider.waitForTransaction(txHash);
  const walletAddress = extractContractAddress(receipt);
  
  // Save contract address (NOT the private key) to config
  config.walletContractAddress = walletAddress;
  config.ownerAddress = phoneWalletAddress; // from WC session
  saveConfig(config);
  
  console.log(`ARC402Wallet deployed: ${walletAddress}`);
  console.log(`Owner: ${phoneWalletAddress} (your phone wallet)`);
}
```

### Update: arc402 wallet policy set-limit

Same pattern — WalletConnect QR → phone wallet signs the PolicyEngine call.

### Backward Compatibility

If `walletConnectProjectId` is not in config, fall back to current EOA signing with a warning:
```
⚠ WalletConnect not configured. Using stored private key (insecure).
  Run `arc402 config set walletConnectProjectId <id>` to enable phone wallet signing.
```

---

## Deliverable 2: Telegram Signing Page

### What It Is

A single-page web app deployed to a stable URL (e.g., `https://arc402.xyz/sign` or a Vercel deployment). When the user taps an action link in Telegram, this page opens on their phone, presents the transaction, triggers Coinbase Smart Wallet or any EIP-1193 provider via passkeys.

### URL Structure

```
https://arc402.xyz/sign?action=freeze&wallet=0x1234&chain=84532&nonce=5&sig=0xabc
```

Parameters:
- `action` — what is being approved: `freeze`, `unfreeze`, `set-policy`, `update-guardian`, `transfer-ownership`
- `wallet` — the ARC402Wallet contract address
- `chain` — chain ID
- `nonce` — contract nonce (prevents replay)
- `sig` — HMAC signature of the params signed by the agent hot key (proves the request came from the legitimate agent, not a phishing attack)

### Page Behavior

1. Load: parse URL params, verify HMAC signature
2. Connect: use Coinbase Wallet SDK or WalletConnect to connect user's phone wallet
3. Show: display human-readable description of what they're approving
   - "Freeze your ARC402Wallet at 0x1234 on Base"
   - "Set cognitive-signatures spend limit to 0.05 ETH/day"
4. Sign: user taps "Approve" → passkey/Face ID → transaction signed + broadcast
5. Confirm: show transaction hash + Basescan link

### HMAC Verification

The agent generates the signing URL:
```typescript
const hmac = createHmac("sha256", agentHotKeyAddress).update(
  `${action}:${wallet}:${chain}:${nonce}`
).digest("hex");
const url = `https://arc402.xyz/sign?action=${action}&wallet=${wallet}&chain=${chain}&nonce=${nonce}&sig=${hmac}`;
```

The signing page verifies the HMAC before presenting the transaction. Prevents phishing links that impersonate the agent.

### Tech Stack

- **Framework:** Next.js (or plain HTML + Vite) — deploy to Vercel
- **Wallet connection:** `@coinbase/wallet-sdk` (primary) + WalletConnect as fallback
- **Chain:** ethers.js or viem
- **Hosting:** Vercel free tier

### How GigaBrain Sends It in Telegram

```typescript
const signingUrl = buildSigningUrl({
  action: "freeze",
  wallet: config.walletContractAddress,
  chain: chainId,
  nonce: await getWalletNonce(config.walletContractAddress)
});

await sendTelegram(
  `⚠️ Suspicious activity detected on agreement #47.\n` +
  `Wallet frozen automatically.\n\n` +
  `To review and unfreeze:\n` +
  `${signingUrl}`
);
```

---

## Testing

### CLI Tests
- `arc402 wallet deploy` shows QR, establishes WC session with a mock wallet
- Session health check detects and warns on near-expiry
- Fallback to EOA when WC not configured

### Signing Page Tests
- HMAC verification rejects tampered params
- Correct transaction is presented for each action type
- Successful signing returns tx hash

---

## Acceptance Criteria

- [ ] `arc402 wallet deploy` shows QR code, phone wallet deployment flow works end-to-end
- [ ] Phone wallet is saved as owner in config (not private key)
- [ ] `arc402 wallet policy set-limit` requires QR approval
- [ ] Signing page renders on mobile (tested on iOS + Android)
- [ ] Telegram link opens signing page, passkey flow completes, transaction confirmed
- [ ] HMAC verification rejects invalid/tampered URLs
- [ ] Backward compatibility: EOA fallback works with warning

---

## Deliverable 3: arc402.xyz/sign — Signing Page Deployment

**Domain:** arc402.xyz (owned by Lego, purchased March 13, 2026)  
**Path:** arc402.xyz/sign  
**Hosting:** Vercel (free tier)  
**Repo location:** Create at `signing-page/` in the arc-402 repo

### What to Build

A single-page app. One route: `/sign`. Everything else is static.

**Tech stack:**
- Plain HTML + vanilla JS, or Vite + TypeScript (preferred — type safety for tx handling)
- `@coinbase/wallet-sdk` for Coinbase Smart Wallet / passkeys
- `@walletconnect/sign-client` as fallback for MetaMask/Rabby
- `ethers.js` for transaction construction
- No backend. No database. Fully static.

### The Page

One screen, three states:

**State 1: Loading/Verifying**
```
ARC-402 Protocol
Verifying request...
```
(HMAC verification happening)

**State 2: Action Confirmation**
```
ARC-402 Protocol
[Icon based on action type]

You are being asked to:
FREEZE your agent wallet

Wallet:   0x1234...5678
Network:  Base Mainnet
Gas est:  ~$0.02

[Connect Wallet to Approve]
```

Supported actions and their human-readable descriptions:
- `freeze` → "FREEZE your agent wallet"
- `unfreeze` → "UNFREEZE your agent wallet"
- `set-policy` → "Update spending limit: [category] → [amount]"
- `set-guardian` → "Update emergency guardian address"
- `transfer-ownership` → "Transfer wallet ownership to [address]"

**State 3: Confirmed**
```
✓ Transaction submitted

[View on Basescan →]
```

### URL Parameters

```
https://arc402.xyz/sign
  ?action=freeze
  &wallet=0x1234...5678
  &chain=8453
  &nonce=12
  &created=1710370800
  &sig=0xabcd...
```

All parameters are required. `created` is a Unix timestamp — links expire after 30 minutes (prevents replay of old signing links).

### HMAC Verification

The page verifies the `sig` parameter before showing anything:
```typescript
const message = `${action}:${wallet}:${chain}:${nonce}:${created}`;
const expectedSig = hmacSHA256(message, agentAddress); // agent hot key address as HMAC key
if (sig !== expectedSig) {
  showError("Invalid or expired signing request");
  return;
}
if (Date.now() / 1000 - Number(created) > 1800) {
  showError("This signing link has expired (30 minute limit)");
  return;
}
```

Note: The HMAC key is the agent's hot key *address* (public, verifiable), not the private key. This prevents key material from being needed on the signing page while still providing authenticity proof.

Actually — use a simpler approach: the agent signs the params with its private key (ECDSA signature). The page recovers the signer address and checks it matches the `agentAddress` param in the URL. Standard ecrecover, no symmetric keys needed.

### Transaction Construction

Each action maps to a specific contract call:

```typescript
const ACTIONS: Record<string, (wallet: string, params: URLParams) => TransactionRequest> = {
  freeze: (wallet) => ({
    to: wallet,
    data: ARC402_WALLET_INTERFACE.encodeFunctionData("freeze", [])
  }),
  unfreeze: (wallet) => ({
    to: wallet,
    data: ARC402_WALLET_INTERFACE.encodeFunctionData("unfreeze", [])
  }),
  "set-policy": (wallet, params) => ({
    to: POLICY_ENGINE_ADDRESS[params.chain],
    data: POLICY_ENGINE_INTERFACE.encodeFunctionData("setSpendLimit", [
      wallet, params.category, params.amount
    ])
  })
  // ... etc
};
```

### Wallet Connection

Try Coinbase Smart Wallet (passkeys) first — best UX on mobile:
```typescript
const coinbase = new CoinbaseWalletSDK({ appName: "ARC-402" });
const provider = coinbase.makeWeb3Provider();
```

If user doesn't have Coinbase Wallet, show WalletConnect QR (in browser modal, not terminal QR):
```typescript
const wcProvider = await EthereumProvider.init({ projectId: WC_PROJECT_ID, ... });
```

### Deployment

```bash
cd signing-page
npm install
npm run build

# Deploy to Vercel
npx vercel --prod

# Configure custom domain in Vercel dashboard:
# arc402.xyz → Vercel project
# arc402.xyz/sign → this app
```

Vercel config (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/sign", "destination": "/index.html" }]
}
```

### Environment Variables (Vercel dashboard)
```
VITE_WC_PROJECT_ID=<walletconnect cloud project id>
VITE_BASE_MAINNET_CHAIN_ID=8453
VITE_BASE_SEPOLIA_CHAIN_ID=84532
VITE_POLICY_ENGINE_MAINNET=<address after mainnet deploy>
VITE_POLICY_ENGINE_TESTNET=0x44102e70c2A366632d98Fe40d892a2501fC7fFF2
```

### CLI Integration: buildSigningUrl()

Add to `cli/src/signing.ts`:
```typescript
export function buildSigningUrl(
  action: string,
  params: Record<string, string>,
  agentPrivateKey: string,
  chainId: number
): string {
  const created = Math.floor(Date.now() / 1000).toString();
  const nonce = params.nonce || "0";
  const message = `${action}:${params.wallet}:${chainId}:${nonce}:${created}`;
  
  // Sign with agent hot key
  const wallet = new ethers.Wallet(agentPrivateKey);
  const sig = await wallet.signMessage(message);
  
  const urlParams = new URLSearchParams({
    action,
    chain: chainId.toString(),
    created,
    sig,
    ...params
  });
  
  return `https://arc402.xyz/sign?${urlParams.toString()}`;
}
```

### Additional Acceptance Criteria (Deliverable 3)

- [ ] `signing-page/` directory exists in repo with Vite + TypeScript setup
- [ ] Page renders correctly on iOS Safari and Android Chrome
- [ ] HMAC/signature verification rejects tampered params
- [ ] 30-minute link expiry enforced
- [ ] Coinbase Smart Wallet connection works (passkeys/Face ID)
- [ ] WalletConnect fallback works (MetaMask Mobile, Rabby)
- [ ] All 5 action types render correct human-readable descriptions
- [ ] Deployed to arc402.xyz/sign on Vercel
- [ ] arc402.xyz/sign loads with HTTPS on mobile

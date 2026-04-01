/**
 * RemoteAuth — owner key challenge-response (Spec 46 §11/§16).
 *
 * Implements the three auth endpoints:
 *   POST /auth/challenge  — issue context-bound challenge for owner to sign
 *   POST /auth/session    — verify EIP-191 signature, issue 24h session token
 *   POST /auth/revoke     — self-revoke all sessions for this wallet
 *
 * Security properties:
 *   - Challenge is single-use and expires in 300s
 *   - Challenge binds to: challengeId + daemonId + wallet + chainId + scope + expiresAt
 *   - Recovered signer must equal wallet.owner() (on-chain check)
 *   - Session token stored as sha256(token) only
 *   - Session scoped to one wallet address
 */
import * as crypto from "crypto";
import { ethers } from "ethers";
import type { Express, Request, Response } from "express";
import Database from "better-sqlite3";
import { SessionManager } from "./session-manager";
import { WALLET_FACTORY_ABI } from "./abis";

const ARC402_WALLET_OWNER_CHECK_ABI = [
  "function owner() external view returns (address)",
] as const;

const CHALLENGE_TTL_MS = 300_000; // 5 minutes

export interface AuthServerConfig {
  daemonId: string;      // stable per-daemon identifier (wallet contract address)
  rpcUrl: string;
  chainId: number;
  walletAddress: string; // this daemon's ARC402Wallet address
}

/**
 * Build the EIP-191 message that the owner must sign.
 *
 * "ARC-402 Remote Auth\nChallenge: " + keccak256(abi.encodePacked(
 *   challengeId, daemonId, wallet, chainId, requestedScope, expiresAt
 * ))
 */
function buildChallengeMessage(
  challengeId: string,
  daemonId: string,
  wallet: string,
  chainId: number,
  scope: string,
  expiresAt: number
): string {
  const packed = ethers.solidityPacked(
    ["bytes32", "address", "address", "uint256", "string", "uint256"],
    [
      ethers.zeroPadBytes(`0x${challengeId}`, 32),
      daemonId,
      wallet,
      chainId,
      scope,
      expiresAt,
    ]
  );
  const hash = ethers.keccak256(packed);
  return `ARC-402 Remote Auth\nChallenge: ${hash}`;
}

/**
 * Query WalletFactory WalletDeployed events to find all wallets owned by a given EOA.
 * Uses eth_getLogs with the WalletFactory addresses known to the daemon.
 */
async function getWalletsForOwner(
  ownerAddress: string,
  provider: ethers.Provider,
  chainId: number
): Promise<string[]> {
  // WalletFactory addresses on Base mainnet (8453)
  // Canonical addresses from the RegistryV3 — hardcoded for Base mainnet fallback
  const WALLET_FACTORY_ADDRESSES_BASE: string[] = [
    "0x9406Cc6185a346906296840746125a0E449764545", // WalletFactoryV6 (Base mainnet)
  ];

  if (chainId !== 8453) {
    // Non-mainnet: skip factory query, return empty (caller handles gracefully)
    return [];
  }

  const wallets: string[] = [];
  const factoryIface = new ethers.Interface(WALLET_FACTORY_ABI as unknown as string[]);
  const deployedTopic = factoryIface.getEvent("WalletDeployed")?.topicHash;
  const createdTopic  = factoryIface.getEvent("WalletCreated")?.topicHash;

  // Pad owner address to 32 bytes for topic filter
  const ownerTopic = ethers.zeroPadValue(ownerAddress.toLowerCase(), 32);

  for (const factoryAddr of WALLET_FACTORY_ADDRESSES_BASE) {
    try {
      // Try WalletDeployed(wallet indexed, owner indexed)
      if (deployedTopic) {
        const logs = await provider.getLogs({
          address: factoryAddr,
          topics: [deployedTopic, null, ownerTopic],
          fromBlock: 0,
          toBlock: "latest",
        });
        for (const log of logs) {
          const parsed = factoryIface.parseLog(log);
          if (parsed?.args.wallet) wallets.push(parsed.args.wallet as string);
        }
      }
      // Try WalletCreated(owner indexed, walletAddress indexed)
      if (createdTopic) {
        const logs = await provider.getLogs({
          address: factoryAddr,
          topics: [createdTopic, ownerTopic],
          fromBlock: 0,
          toBlock: "latest",
        });
        for (const log of logs) {
          const parsed = factoryIface.parseLog(log);
          if (parsed?.args.walletAddress) wallets.push(parsed.args.walletAddress as string);
        }
      }
    } catch {
      // Factory query failed — continue with other factories
    }
  }

  return [...new Set(wallets)];
}

export function registerAuthRoutes(
  app: Express,
  db: Database.Database,
  cfg: AuthServerConfig
): void {
  const sessions = new SessionManager(db);
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);

  // ─── POST /auth/challenge ─────────────────────────────────────────────────────
  // { wallet, requestedScope } → { challengeId, challenge, expiresAt }

  app.post("/auth/challenge", (req: Request, res: Response): void => {
    const { wallet, requestedScope } = req.body as {
      wallet?: string;
      requestedScope?: string;
    };

    if (!wallet || !ethers.isAddress(wallet)) {
      res.status(400).json({ error: "valid wallet address required" });
      return;
    }

    const scope = requestedScope ?? "operator";
    const challengeId = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + CHALLENGE_TTL_MS;

    sessions.storeChallenge({
      challengeId,
      daemonId: cfg.daemonId,
      wallet,
      chainId: cfg.chainId,
      scope,
      expiresAt,
    });

    const challengeMessage = buildChallengeMessage(
      challengeId,
      cfg.daemonId,
      wallet,
      cfg.chainId,
      scope,
      expiresAt
    );

    res.json({
      challengeId,
      challenge: challengeMessage,
      daemonId: cfg.daemonId,
      wallet,
      chainId: cfg.chainId,
      scope,
      expiresAt,
      issuedAt: now,
    });
  });

  // ─── POST /auth/session ───────────────────────────────────────────────────────
  // { challengeId, signature } → { token, wallets, expiresAt }

  app.post("/auth/session", (req: Request, res: Response): void => {
    void (async () => {
      const { challengeId, signature } = req.body as {
        challengeId?: string;
        signature?: string;
      };

      if (!challengeId || !signature) {
        res.status(400).json({ error: "challengeId and signature required" });
        return;
      }

      // 1. Load challenge from store
      const challenge = sessions.getChallenge(challengeId);
      if (!challenge) {
        res.status(401).json({ error: "challenge_not_found" });
        return;
      }
      if (challenge.used) {
        res.status(401).json({ error: "challenge_already_used" });
        return;
      }
      if (Date.now() > challenge.expires_at) {
        res.status(401).json({ error: "challenge_expired" });
        return;
      }

      // 2. Rebuild challenge message and recover signer from EIP-191 signature
      const message = buildChallengeMessage(
        challenge.challenge_id ?? challengeId,
        challenge.daemon_id,
        challenge.wallet,
        challenge.chain_id,
        challenge.scope,
        challenge.expires_at
      );

      let recoveredSigner: string;
      try {
        recoveredSigner = ethers.verifyMessage(message, signature);
      } catch {
        res.status(401).json({ error: "invalid_signature" });
        return;
      }

      // 3. Verify recovered signer === wallet.owner() (on-chain check)
      const walletContract = new ethers.Contract(
        challenge.wallet,
        ARC402_WALLET_OWNER_CHECK_ABI,
        provider
      );
      let onChainOwner: string;
      try {
        onChainOwner = await walletContract.owner() as string;
      } catch {
        res.status(503).json({ error: "rpc_unavailable" });
        return;
      }

      if (recoveredSigner.toLowerCase() !== onChainOwner.toLowerCase()) {
        res.status(401).json({ error: "signer_not_owner" });
        return;
      }

      // 4. Query WalletFactory for all wallets owned by this EOA
      let ownedWallets: string[] = [];
      try {
        ownedWallets = await getWalletsForOwner(recoveredSigner, provider, cfg.chainId);
      } catch {
        // Non-fatal — continue with empty wallet list
      }
      // Always include the challenged wallet
      if (!ownedWallets.some(w => w.toLowerCase() === challenge.wallet.toLowerCase())) {
        ownedWallets = [challenge.wallet, ...ownedWallets];
      }

      // 5. Mark challenge as used (single-use)
      sessions.markChallengeUsed(challengeId);

      // 6. Issue session token
      const rawToken = sessions.createSession(challenge.wallet, challenge.scope);

      // 7. Return token + wallet list
      const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
      res.json({
        token: rawToken,
        wallets: ownedWallets,
        wallet: challenge.wallet,
        scope: challenge.scope,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
    })();
  });

  // ─── POST /auth/revoke ────────────────────────────────────────────────────────
  // Invalidate all sessions for this wallet. Requires valid session token.

  app.post("/auth/revoke", (req: Request, res: Response): void => {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "no_session" });
      return;
    }

    const session = sessions.validateSession(token);
    if (!session) {
      res.status(401).json({ error: "invalid_session" });
      return;
    }

    sessions.revokeByWallet(session.wallet);
    res.json({ ok: true, revoked: session.wallet });
  });
}

import { Command } from "commander";
import { ethers } from "ethers";
import { getCanonicalAgentRegistryAddress, getCanonicalNetworkAddress, getUsdcAddress, loadConfig } from "../config";
import { requireSigner } from "../client";
import { AGENT_REGISTRY_ABI, ARC402_WALLET_EXECUTE_ABI } from "../abis";
import { requestOwnerApproval } from "../approval/broker";
import { sendTransactionWithSession } from "../walletconnect";
import { startSpinner } from "../ui/spinner";
import { renderTree } from "../ui/tree";
import { c } from "../ui/colors";

async function pingHandshakeEndpoint(
  agentAddress: string,
  payload: Record<string, unknown>,
  registryAddress: string,
  provider: ethers.Provider
): Promise<void> {
  const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);
  const agentData = await registry.getAgent(agentAddress);
  const endpoint = agentData.endpoint as string;
  if (!endpoint) return;
  await fetch(`${endpoint}/handshake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ─── Handshake Contract ABI (from Handshake.sol) ─────────────────────────────

const HANDSHAKE_ABI = [
  "function sendHandshake(address to, uint8 hsType, string note) payable",
  "function sendHandshakeWithToken(address to, uint8 hsType, string note, address token, uint256 tokenAmount)",
  "function sendBatch(address[] recipients, uint8[] hsTypes, string[] notes)",
  "function hasConnection(address from, address to) view returns (bool)",
  "function isMutual(address a, address b) view returns (bool)",
  "function getStats(address agent) view returns (uint256 sent, uint256 received, uint256 uniqueInbound)",
  "function sentCount(address) view returns (uint256)",
  "function receivedCount(address) view returns (uint256)",
  "function uniqueSenders(address) view returns (uint256)",
  "function totalHandshakes() view returns (uint256)",
  "function allowedTokens(address) view returns (bool)",
  "event HandshakeSent(uint256 indexed handshakeId, address indexed from, address indexed to, uint8 hsType, address token, uint256 amount, string note, uint256 timestamp)",
  "event NewConnection(address indexed from, address indexed to, uint256 handshakeId)",
];

const POLICY_ENGINE_ABI = [
  "function isContractWhitelisted(address wallet, address target) view returns (bool)",
  "function whitelistContract(address wallet, address target)",
];

const HANDSHAKE_TYPES: Record<string, number> = {
  respect: 0,
  curiosity: 1,
  endorsement: 2,
  thanks: 3,
  collaboration: 4,
  challenge: 5,
  referral: 6,
  hello: 7,
};

// ─── Auto-Whitelist ──────────────────────────────────────────────────────────

async function ensureWhitelisted(
  config: ReturnType<typeof loadConfig>,
  provider: ethers.Provider,
  walletAddress: string,
  policyEngineAddress: string,
  handshakeAddress: string
): Promise<void> {
  const pe = new ethers.Contract(policyEngineAddress, POLICY_ENGINE_ABI, provider);
  const isWhitelisted = await pe.isContractWhitelisted(walletAddress, handshakeAddress);

  if (!isWhitelisted) {
    console.log("Handshake contract not yet whitelisted on your wallet.");
    console.log("Whitelisting now (one-time setup via owner approval)...");

    if (!config.walletContractAddress || config.walletContractAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error("Handshake whitelist requires walletContractAddress config to match the ARC-402 wallet identity.");
    }

    const chainId = config.network === "base-mainnet" ? 8453 : 84532;
    const policyIface = new ethers.Interface(POLICY_ENGINE_ABI);
    const txData = {
      to: policyEngineAddress,
      data: policyIface.encodeFunctionData("whitelistContract", [walletAddress, handshakeAddress]),
      value: "0x0",
    };

    const approval = await requestOwnerApproval({
      actionType: "policy_update",
      signerMode: "owner_wallet",
      chainId,
      walletAddress,
      txs: [txData],
      ui: {
        title: "Whitelist handshake contract",
        summary: "Approve: whitelist Handshake on PolicyEngine for your ARC-402 wallet",
        risk: "high",
      },
      metadata: {
        category: "policy",
        sourceRuntime: "cli",
      },
    }, config);

    if (approval.status !== "approved" || !approval.session || approval.session.kind !== "walletconnect") {
      throw new Error(approval.error ?? "Owner approval transport failed");
    }

    const { client, session, account } = approval.session;
    const txHash = await sendTransactionWithSession(client, session, account, chainId, txData);
    await provider.waitForTransaction(txHash);
    console.log(`  tx: ${txHash}`);
    console.log("  ✓ Handshake contract whitelisted\n");
  }
}

async function sendHandshakeViaWallet(
  signer: ethers.Signer,
  walletAddress: string,
  handshakeAddress: string,
  agentAddress: string,
  hsType: number,
  note: string,
  opts: { tip?: string; usdc?: string },
  usdcAddress: string,
): Promise<ethers.ContractTransactionResponse> {
  const handshakeIface = new ethers.Interface(HANDSHAKE_ABI);
  let data: string;
  let value = 0n;

  if (opts.usdc) {
    const amount = ethers.parseUnits(opts.usdc, 6);
    data = handshakeIface.encodeFunctionData("sendHandshakeWithToken", [agentAddress, hsType, note, usdcAddress, amount]);
  } else {
    value = opts.tip ? ethers.parseEther(opts.tip) : 0n;
    data = handshakeIface.encodeFunctionData("sendHandshake", [agentAddress, hsType, note]);
  }

  const wallet = new ethers.Contract(walletAddress, ARC402_WALLET_EXECUTE_ABI, signer);
  return await wallet.executeContractCall({
    target: handshakeAddress,
    data,
    value,
    minReturnValue: 0n,
    maxApprovalAmount: 0n,
    approvalToken: ethers.ZeroAddress,
  });
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function registerArenaHandshakeCommands(program: Command): void {
  const hs = program
    .command("shake")
    .description("ARC Arena social handshake — send a typed trust signal to another agent.");

  // ── send ──────────────────────────────────────────────────────────────────
  hs.command("send <agentAddress>")
    .description("Send a handshake to another agent.")
    .option("--type <type>", "Handshake type: respect, curiosity, endorsement, thanks, collaboration, challenge, referral, hello", "hello")
    .option("--note <note>", "Short message (max 280 chars)", "")
    .option("--tip <amount>", "ETH tip to attach (e.g. 0.01)")
    .option("--usdc <amount>", "USDC tip to attach (e.g. 5.00)")
    .option("--json", "Output as JSON")
    .action(async (agentAddress: string, opts) => {
      const config = loadConfig();
      const { signer, provider } = await requireSigner(config);
      const signerAddress = await signer.getAddress();
      const walletAddress = config.walletContractAddress ?? signerAddress;
      const myAddress = walletAddress;

      const handshakeAddress = getCanonicalNetworkAddress(config, "handshakeAddress");
      const policyEngineAddress = getCanonicalNetworkAddress(config, "policyEngineAddress");
      const registryAddress = getCanonicalAgentRegistryAddress(config);

      const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);
      const theirRegistered = await registry.isRegistered(agentAddress);
      if (!theirRegistered) {
        throw new Error(`Target ${agentAddress} is not registered in AgentRegistry. Handshake targets must be ARC-402 wallet identities, not machine keys.`);
      }
      const theirAgent = await registry.getAgent(agentAddress);
      if (!theirAgent.active) {
        throw new Error(`Agent ${agentAddress} is not active in AgentRegistry`);
      }

      // Auto-whitelist check
      await ensureWhitelisted(config, provider, walletAddress, policyEngineAddress, handshakeAddress);

      const hsType = HANDSHAKE_TYPES[opts.type.toLowerCase()];
      if (hsType === undefined) {
        console.error(`Unknown handshake type: ${opts.type}`);
        console.error(`Valid types: ${Object.keys(HANDSHAKE_TYPES).join(", ")}`);
        process.exit(1);
      }

      const hsSpinner = startSpinner(`Sending ${opts.type} handshake...`);
      let tx;
      const usdcAddress = getUsdcAddress(config);
      if (config.walletContractAddress) {
        tx = await sendHandshakeViaWallet(signer, config.walletContractAddress, handshakeAddress, agentAddress, hsType, opts.note, opts, usdcAddress);
      } else {
        const handshake = new ethers.Contract(handshakeAddress, HANDSHAKE_ABI, signer);
        if (opts.usdc) {
          const amount = ethers.parseUnits(opts.usdc, 6);
          tx = await handshake.sendHandshakeWithToken(agentAddress, hsType, opts.note, usdcAddress, amount);
        } else {
          const value = opts.tip ? ethers.parseEther(opts.tip) : 0n;
          tx = await handshake.sendHandshake(agentAddress, hsType, opts.note, { value });
        }
      }
      hsSpinner.succeed("Handshake sent");

      // Notify recipient's HTTP endpoint (non-blocking)
      try {
        await pingHandshakeEndpoint(
          agentAddress,
          { from: myAddress, type: opts.type, note: opts.note, txHash: tx.hash },
          registryAddress,
          provider
        );
      } catch (err) {
        console.warn(`Warning: could not notify recipient endpoint: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (opts.json) {
        console.log(JSON.stringify({ tx: tx.hash, from: myAddress, to: agentAddress, type: opts.type, note: opts.note }));
      } else {
        const treeItems = [
          { label: "From", value: myAddress },
          { label: "To", value: agentAddress },
          { label: "Type", value: opts.type },
          ...(opts.note ? [{ label: "Note", value: opts.note as string }] : []),
          ...(opts.tip ? [{ label: "Tip", value: `${opts.tip as string} ETH` }] : []),
          ...(opts.usdc ? [{ label: "Tip", value: `${opts.usdc as string} USDC` }] : []),
          { label: "Tx", value: tx.hash as string, last: true },
        ];
        renderTree(treeItems);
      }
    });

  // ── batch ─────────────────────────────────────────────────────────────────
  hs.command("batch")
    .description("Send handshakes to multiple agents at once (onboarding ritual).")
    .argument("<agents...>", "Agent addresses to handshake (up to 10)")
    .option("--type <type>", "Handshake type for all", "hello")
    .option("--note <note>", "Note for all", "")
    .action(async (agents: string[], opts) => {
      const config = loadConfig();
      const { signer, provider } = await requireSigner(config);
      const signerAddress = await signer.getAddress();
      const walletAddress = config.walletContractAddress ?? signerAddress;
      const myAddress = walletAddress;

      const handshakeAddress = getCanonicalNetworkAddress(config, "handshakeAddress");
      const policyEngineAddress = getCanonicalNetworkAddress(config, "policyEngineAddress");
      const registryAddress = getCanonicalAgentRegistryAddress(config);

      const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);
      for (const agent of agents) {
        const isRegistered = await registry.isRegistered(agent);
        if (!isRegistered) {
          throw new Error(`Target ${agent} is not registered in AgentRegistry. Batch handshake targets must be ARC-402 wallet identities, not machine keys.`);
        }
      }

      await ensureWhitelisted(config, provider, walletAddress, policyEngineAddress, handshakeAddress);

      const hsType = HANDSHAKE_TYPES[opts.type.toLowerCase()];
      if (hsType === undefined) {
        console.error(`Unknown type: ${opts.type}. Valid: ${Object.keys(HANDSHAKE_TYPES).join(", ")}`);
        process.exit(1);
      }

      if (agents.length > 10) {
        console.error("Max 10 agents per batch.");
        process.exit(1);
      }

      const types = agents.map(() => hsType);
      const notes = agents.map(() => opts.note);

      let tx;
      if (config.walletContractAddress) {
        const handshakeIface = new ethers.Interface(HANDSHAKE_ABI);
        const data = handshakeIface.encodeFunctionData("sendBatch", [agents, types, notes]);
        const wallet = new ethers.Contract(config.walletContractAddress, ARC402_WALLET_EXECUTE_ABI, signer);
        tx = await wallet.executeContractCall({
          target: handshakeAddress,
          data,
          value: 0n,
          minReturnValue: 0n,
          maxApprovalAmount: 0n,
          approvalToken: ethers.ZeroAddress,
        });
      } else {
        const handshake = new ethers.Contract(handshakeAddress, HANDSHAKE_ABI, signer);
        tx = await handshake.sendBatch(agents, types, notes);
      }
      console.log(`✓ Batch handshake sent to ${agents.length} agents`);
      agents.forEach(a => console.log(`  → ${a}`));
      console.log(`  tx: ${tx.hash}`);
    });

  // ── stats ─────────────────────────────────────────────────────────────────
  hs.command("stats [address]")
    .description("View handshake stats for an agent.")
    .action(async (address?: string) => {
      const config = loadConfig();
      const { signer, provider } = await requireSigner(config);
      const target = address || await signer.getAddress();

      if (!config.handshakeAddress) {
        console.error("handshakeAddress not configured.");
        process.exit(1);
      }

      const handshake = new ethers.Contract(config.handshakeAddress, HANDSHAKE_ABI, provider);
      const [sent, received, unique] = await handshake.getStats(target);
      const total = await handshake.totalHandshakes();

      console.log(`Handshake Stats: ${target}`);
      console.log(`  Sent:            ${sent}`);
      console.log(`  Received:        ${received}`);
      console.log(`  Unique senders:  ${unique}`);
      console.log(`  Network total:   ${total}`);
    });

  // ── ping ──────────────────────────────────────────────────────────────────
  // Send HTTP-only endpoint notification (no on-chain tx, no rate limit).
  // Useful for: testing endpoint reachability, resending a missed notification
  // after the on-chain handshake already went through.
  hs.command("ping <agentAddress>")
    .description("Send an HTTP endpoint notification only — no on-chain tx, no rate limit. Tests reachability.")
    .option("--note <note>", "Message to include in the ping", "ping")
    .action(async (agentAddress: string, opts: { note: string }) => {
      const config = loadConfig();
      const { signer, provider } = await requireSigner(config);
      const registryAddress = config.agentRegistryV2Address
        ?? config.agentRegistryAddress
        ?? "0xD5c2851B00090c92Ba7F4723FB548bb30C9B6865";

      const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);
      const agentData = await registry.getAgent(agentAddress);
      const endpoint = agentData.endpoint as string;

      if (!endpoint) {
        console.error(`Agent ${agentAddress} has no endpoint registered.`);
        process.exit(1);
      }

      const from = await signer.getAddress();
      const timestamp = Date.now();
      const message = `arc402-ping:${agentAddress}:${timestamp}`;
      const signature = await signer.signMessage(message);

      const url = `${endpoint}/handshake`;
      console.log(`Pinging ${url}…`);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ping",
            from,
            note: opts.note,
            timestamp,
            signature,
          }),
        });
        const body = await res.text();
        if (res.ok) {
          console.log(`✓ Endpoint responded ${res.status}: ${body}`);
        } else {
          console.log(`⚠ Endpoint returned ${res.status}: ${body}`);
        }
      } catch (err) {
        console.error(`✗ Endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ── check ─────────────────────────────────────────────────────────────────
  hs.command("check <agentAddress>")
    .description("Check if a connection or mutual handshake exists with an agent.")
    .action(async (agentAddress: string) => {
      const config = loadConfig();
      const { signer, provider } = await requireSigner(config);
      const myAddress = await signer.getAddress();

      if (!config.handshakeAddress) {
        console.error("handshakeAddress not configured.");
        process.exit(1);
      }

      const handshake = new ethers.Contract(config.handshakeAddress, HANDSHAKE_ABI, provider);
      const iSent = await handshake.hasConnection(myAddress, agentAddress);
      const theySent = await handshake.hasConnection(agentAddress, myAddress);
      const mutual = await handshake.isMutual(myAddress, agentAddress);

      console.log(`Connection: ${myAddress} ↔ ${agentAddress}`);
      console.log(`  You → them: ${iSent ? "✓ handshaked" : "✗ no handshake"}`);
      console.log(`  Them → you: ${theySent ? "✓ handshaked" : "✗ no handshake"}`);
      console.log(`  Mutual:     ${mutual ? "✓ yes" : "✗ no"}`);
    });
}

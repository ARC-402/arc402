/**
 * Arena tools — arc402_handshake, arc402_arena_status, arc402_feed
 * Arena v2 tools — post-status, rounds, squad, briefing, newsletter, split, discover, trending
 *
 * PLG-9: Uses execFileSync array form to prevent command injection.
 */
import { Type } from "@sinclair/typebox";
import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { PluginApi, ToolResult } from "./hire.js";

export function registerArenaTools(api: PluginApi) {
  // ── Existing tools ────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_handshake",
    description:
      "Send an arena handshake to another agent — broadcasts availability and optional tip to signal intent to collaborate.",
    parameters: Type.Object({
      target: Type.String({ description: "Target agent wallet address (0x...)" }),
      tip: Type.Optional(Type.String({ description: "Optional tip amount in ETH to attach to the handshake" })),
    }),
    async execute(_id, params) {
      const args = ["arena-handshake", "send", params.target];
      if (params.tip) args.push("--tip", params.tip);
      return shell(args);
    },
  });

  api.registerTool({
    name: "arc402_arena_status",
    description: "Show arena status — active handshakes, pending matches, and current availability broadcast.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "status"]);
    },
  });

  api.registerTool({
    name: "arc402_feed",
    description: "List the ARC-402 activity feed — recent hires, deliveries, disputes, and arena events.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["feed", "list"]);
    },
  });

  // ── Status ────────────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_post_status",
    description: "Post a status update on-chain via StatusRegistry.",
    parameters: Type.Object({
      content: Type.String({ description: "Status text to post" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "status", params.content]);
    },
  });

  // ── Rounds (ArenaPool) ────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_rounds",
    description: "List active prediction rounds.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max results (default 20)" })),
      json: Type.Optional(Type.Boolean({ description: "Output as JSON" })),
    }),
    async execute(_id, params) {
      const args = ["arena", "rounds"];
      if (params.limit !== undefined) args.push("--limit", String(params.limit));
      if (params.json) args.push("--json");
      return shell(args);
    },
  });

  api.registerTool({
    name: "arc402_arena_round_create",
    description: "Create a new prediction round.",
    parameters: Type.Object({
      question: Type.String({ description: "Prediction question" }),
      stake: Type.String({ description: "Minimum entry stake in USDC (e.g. '1')" }),
      deadline: Type.String({ description: "Duration e.g. 24h, 3d, 1d12h" }),
    }),
    async execute(_id, params) {
      return shell([
        "arena", "round", "create", params.question,
        "--duration", params.deadline,
        "--category", "general",
        "--min-entry", params.stake,
      ]);
    },
  });

  api.registerTool({
    name: "arc402_arena_join_round",
    description: "Enter a prediction round by staking on a side.",
    parameters: Type.Object({
      roundId: Type.String({ description: "Round ID" }),
      side: Type.Union([Type.Literal("yes"), Type.Literal("no")], { description: "Your prediction: yes or no" }),
      amount: Type.String({ description: "Amount to stake in USDC" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "join", params.roundId, "--side", params.side, "--amount", params.amount]);
    },
  });

  api.registerTool({
    name: "arc402_arena_standings",
    description: "Show Arena leaderboard standings.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "standings"]);
    },
  });

  api.registerTool({
    name: "arc402_arena_claim",
    description: "Claim winnings from a resolved prediction round.",
    parameters: Type.Object({
      roundId: Type.String({ description: "Round ID to claim from" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "round", "claim", params.roundId]);
    },
  });

  // ── Squads ────────────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_squad_list",
    description: "List research squads in the arena.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "squad", "list"]);
    },
  });

  api.registerTool({
    name: "arc402_arena_squad_create",
    description: "Create a new research squad.",
    parameters: Type.Object({
      name: Type.String({ description: "Squad name" }),
      description: Type.Optional(Type.String({ description: "Domain tag for the squad" })),
    }),
    async execute(_id, params) {
      return shell([
        "arena", "squad", "create", params.name,
        "--domain", params.description ?? params.name,
      ]);
    },
  });

  api.registerTool({
    name: "arc402_arena_squad_join",
    description: "Join a research squad.",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "squad", "join", params.squadId]);
    },
  });

  api.registerTool({
    name: "arc402_arena_squad_contribute",
    description: "Record a contribution to a research squad.",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
      contentHash: Type.String({ description: "Contribution content hash (bytes32 hex, 0x...)" }),
      endpoint: Type.String({ description: "Contribution description" }),
    }),
    async execute(_id, params) {
      return shell([
        "arena", "squad", "contribute", params.squadId,
        "--hash", params.contentHash,
        "--description", params.endpoint,
      ]);
    },
  });

  api.registerTool({
    name: "arc402_arena_squad_info",
    description: "Get details, members, and briefings for a research squad.",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "squad", "info", params.squadId]);
    },
  });

  // ── Briefings ─────────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_briefing_publish",
    description: "Publish a briefing to a squad (creator/admin).",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
      content: Type.String({ description: "Full briefing content" }),
      preview: Type.String({ description: "Short preview text" }),
      endpoint: Type.String({ description: "Briefing endpoint URL" }),
    }),
    async execute(_id, params) {
      return withTempFile(params.content, (file) =>
        shell(["arena", "briefing", "publish", params.squadId, "--file", file, "--preview", params.preview, "--endpoint", params.endpoint])
      );
    },
  });

  api.registerTool({
    name: "arc402_arena_briefing_propose",
    description: "Propose a briefing for squad LEAD approval.",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
      content: Type.String({ description: "Full briefing content" }),
      preview: Type.String({ description: "Short preview text" }),
      endpoint: Type.String({ description: "Briefing endpoint URL" }),
    }),
    async execute(_id, params) {
      return withTempFile(params.content, (file) =>
        shell(["arena", "briefing", "propose", params.squadId, "--file", file, "--preview", params.preview, "--endpoint", params.endpoint])
      );
    },
  });

  api.registerTool({
    name: "arc402_arena_briefing_list",
    description: "List published briefings for a squad.",
    parameters: Type.Object({
      squadId: Type.String({ description: "Squad ID" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "briefing", "list", params.squadId]);
    },
  });

  // ── Newsletters ───────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_newsletter_create",
    description: "Create a new agent newsletter.",
    parameters: Type.Object({
      name: Type.String({ description: "Newsletter name" }),
      description: Type.String({ description: "Newsletter description" }),
      endpoint: Type.String({ description: "Newsletter endpoint URL" }),
    }),
    async execute(_id, params) {
      return shell([
        "arena", "newsletter", "create", params.name,
        "--description", params.description,
        "--endpoint", params.endpoint,
      ]);
    },
  });

  api.registerTool({
    name: "arc402_arena_newsletter_publish",
    description: "Publish a newsletter issue.",
    parameters: Type.Object({
      newsletterId: Type.String({ description: "Newsletter ID" }),
      content: Type.String({ description: "Full issue content" }),
      preview: Type.String({ description: "Short preview text" }),
      endpoint: Type.String({ description: "Issue endpoint URL" }),
    }),
    async execute(_id, params) {
      return withTempFile(params.content, (file) =>
        shell(["arena", "newsletter", "publish", params.newsletterId, "--file", file, "--preview", params.preview, "--endpoint", params.endpoint])
      );
    },
  });

  api.registerTool({
    name: "arc402_arena_newsletter_list",
    description: "List newsletters for the current agent.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "newsletter", "list"]);
    },
  });

  // ── Revenue splits ────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_split_create",
    description: 'Create a revenue split contract for squad members.',
    parameters: Type.Object({
      members: Type.String({ description: 'Comma-separated name:share% pairs, e.g. "GigaBrain:40,MegaBrain:60"' }),
    }),
    async execute(_id, params) {
      return shell(["arena", "split", "create", "--members", params.members]);
    },
  });

  api.registerTool({
    name: "arc402_arena_split_info",
    description: "Show details of a deployed revenue split contract.",
    parameters: Type.Object({
      address: Type.String({ description: "Revenue split contract address (0x...)" }),
    }),
    async execute(_id, params) {
      return shell(["arena", "split", "info", params.address]);
    },
  });

  // ── Discovery ─────────────────────────────────────────────────────────────

  api.registerTool({
    name: "arc402_arena_discover",
    description: "Discover agents registered in the arena.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "discover"]);
    },
  });

  api.registerTool({
    name: "arc402_arena_trending",
    description: "Show trending agents and squads in the arena.",
    parameters: Type.Object({}),
    async execute() {
      return shell(["arena", "trending"]);
    },
  });
}

function withTempFile(content: string, fn: (path: string) => ToolResult): ToolResult {
  const dir = mkdtempSync(join(tmpdir(), "arc402-"));
  const file = join(dir, "content.md");
  try {
    writeFileSync(file, content, "utf-8");
    return fn(file);
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

function shell(args: string[], timeout = 30_000): ToolResult {
  try {
    const text = execFileSync("arc402", args, { encoding: "utf-8", timeout });
    return { content: [{ type: "text", text: text.trim() }] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }] };
  }
}

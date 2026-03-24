#!/usr/bin/env node
/**
 * mcp-server.js — GigaBrain Memory MCP Server v2.0.0
 *
 * Exposes gigabrain memory tools via the Model Context Protocol.
 * Compatible with Claude Code, Codex, Claude Desktop, and any MCP client.
 *
 * Usage:
 *   node mcp-server.js
 *   GIGABRAIN_WORKSPACE=/path/to/workspace node mcp-server.js
 */

// ─── SELF-BOOTSTRAP with --experimental-sqlite ────────────────────────────────
// node:sqlite requires --experimental-sqlite on Node 22. We re-exec if needed.
let _sqlitest;
try {
  _sqlitest = await import('node:sqlite');
} catch {
  const { spawn } = await import('node:child_process');
  const p = spawn(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
    stdio: 'inherit',
  });
  p.on('exit', code => process.exit(code ?? 0));
  await new Promise(() => {});
}

// ─── IMPORTS ──────────────────────────────────────────────────────────────────

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDbPath, getWorkspaceRoot, loadConfig, saveConfig } from './lib/config.js';
import { openDatabase } from './lib/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '2.0.0';
const SERVER_NAME = 'gigabrain-memory';

// ─── DB INIT ──────────────────────────────────────────────────────────────────

const dbPath = getDbPath();
const workspaceRoot = getWorkspaceRoot();
let db;

try {
  db = openDatabase(dbPath);
} catch (err) {
  process.stderr.write(`[gigabrain-mcp] Failed to open DB at ${dbPath}: ${err.message}\n`);
  process.exit(1);
}

process.stderr.write(`GigaBrain Memory MCP server v${VERSION} — DB: ${dbPath}\n`);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const SALIENCE_MAP = {
  DECISION: 1.0,
  CORRECTION: 1.0,
  INSIGHT: 0.9,
  ARCHITECTURE: 0.85,
  GOAL_UPDATE: 0.75,
  PREFERENCE: 0.8,
  EMOTIONAL_SIGNAL: 0.8,
  CONTENT_SEED: 0.75,
  USER_FACT: 0.75,
  ENTITY: 0.6,
  EPISODE: 0.4,
  CONVERSATION: 0.4,
};

function classifyRecallStrategy(query) {
  const q = query.toLowerCase();
  if (/\b(who is|tell me about|what do (you|we) know about|entity|person|project|brand|tool)\b/.test(q)) return 'entity';
  if (/\b(what happened|when did|timeline|last (week|month|time)|history|chronolog)\b/.test(q)) return 'timeline';
  if (/\b(did (we|i) decide|what'?s the plan|did (we|i) agree|what did we decide|our decision)\b/.test(q)) return 'decision';
  if (/\b(didn'?t (i|we) say|contradicts?|conflict|earlier (i|we) said|verify|check if)\b/.test(q)) return 'verification';
  return 'general';
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sessionId() {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function jsonContent(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function errContent(msg) {
  return { isError: true, content: [{ type: 'text', text: String(msg) }] };
}

function tableExists(tableName) {
  try {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    return !!row;
  } catch {
    return false;
  }
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'gigabrain_recall',
    description: 'Retrieve relevant memory chunks for a query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        agent_id: { type: 'string', description: 'Filter by agent ID (optional)' },
        strategy: {
          type: 'string',
          enum: ['entity', 'timeline', 'decision', 'verification', 'general'],
          description: 'Recall strategy (auto-detected from query if not provided)',
        },
        limit: { type: 'number', description: 'Max chunks to return (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gigabrain_remember',
    description: 'Store a durable memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content to store' },
        type: {
          type: 'string',
          enum: ['DECISION', 'INSIGHT', 'CORRECTION', 'ARCHITECTURE', 'GOAL_UPDATE', 'PREFERENCE'],
          description: 'Memory type (default: INSIGHT)',
        },
        confidence: { type: 'number', description: 'Confidence score 0–1 (default: 0.9)' },
        agent_id: { type: 'string', description: 'Agent scope (optional)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'gigabrain_checkpoint',
    description: 'Save a session checkpoint — key decisions, progress, and next steps',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Session summary' },
        decisions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key decisions made (optional)',
        },
        agent_id: { type: 'string', description: 'Agent scope (optional)' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'gigabrain_entity',
    description: 'Get everything known about an entity (person, project, brand, tool)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Entity name to look up' },
        agent_id: { type: 'string', description: 'Filter by agent (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'gigabrain_contradictions',
    description: 'List unresolved contradictions in memory',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent (optional)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },
  {
    name: 'gigabrain_patterns',
    description: 'Get detected cross-session patterns',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Filter by domain (optional)' },
        agent_id: { type: 'string', description: 'Filter by agent (optional)' },
      },
    },
  },
  {
    name: 'gigabrain_stats',
    description: 'Memory system health and statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'gigabrain_workspace',
    description: 'Get or set the workspace path for this memory installation',
    inputSchema: {
      type: 'object',
      properties: {
        set_path: { type: 'string', description: 'New workspace path to set (optional)' },
      },
    },
  },
];

// ─── TOOL HANDLERS ────────────────────────────────────────────────────────────

async function handle_gigabrain_recall({ query, agent_id, strategy, limit = 10 }) {
  const resolvedStrategy = strategy ?? classifyRecallStrategy(query);

  // Escape FTS query (wrap in quotes for phrase, else use as-is)
  const ftsQuery = query.replace(/["]/g, '""');

  let rows;
  try {
    if (agent_id) {
      rows = db.prepare(`
        SELECT c.chunk_type, c.session_date, c.content, c.agent_id, c.salience_score
        FROM context_chunks_fts fts
        JOIN context_chunks c ON c.rowid = fts.rowid
        WHERE context_chunks_fts MATCH ?
          AND c.agent_id = ?
        ORDER BY bm25(context_chunks_fts)
        LIMIT ?
      `).all(ftsQuery, agent_id, limit);
    } else {
      rows = db.prepare(`
        SELECT c.chunk_type, c.session_date, c.content, c.agent_id, c.salience_score
        FROM context_chunks_fts fts
        JOIN context_chunks c ON c.rowid = fts.rowid
        WHERE context_chunks_fts MATCH ?
        ORDER BY bm25(context_chunks_fts)
        LIMIT ?
      `).all(ftsQuery, limit);
    }
  } catch (err) {
    // FTS may fail on complex queries — fall back to LIKE search
    try {
      const likeQuery = `%${query.slice(0, 100)}%`;
      if (agent_id) {
        rows = db.prepare(`
          SELECT chunk_type, session_date, content, agent_id, salience_score
          FROM context_chunks WHERE content LIKE ? AND agent_id = ?
          ORDER BY salience_score DESC, session_date DESC LIMIT ?
        `).all(likeQuery, agent_id, limit);
      } else {
        rows = db.prepare(`
          SELECT chunk_type, session_date, content, agent_id, salience_score
          FROM context_chunks WHERE content LIKE ?
          ORDER BY salience_score DESC, session_date DESC LIMIT ?
        `).all(likeQuery, limit);
      }
    } catch (e2) {
      return errContent(`Recall failed: ${e2.message}`);
    }
  }

  return jsonContent({
    strategy: resolvedStrategy,
    query,
    chunks: rows ?? [],
    count: (rows ?? []).length,
  });
}

async function handle_gigabrain_remember({ content, type = 'INSIGHT', confidence = 0.9, agent_id }) {
  const chunkType = type.toUpperCase();
  const salience = SALIENCE_MAP[chunkType] ?? 0.7;
  const sid = sessionId();
  const date = today();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO context_chunks
        (session_id, session_date, chunk_type, source_type, content, agent_id,
         salience_score, classification_confidence, domains, created_at)
      VALUES (?, ?, ?, 'explicit', ?, ?, ?, ?, '[]', ?)
    `).run(sid, date, chunkType, content, agent_id ?? null, salience, confidence, now);

    // Also insert into memory_current as an active memory
    const key = `${chunkType}:${date}:${Math.random().toString(36).slice(2, 8)}`;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO memory_current (key, value, value_score, status, updated_at)
        VALUES (?, ?, ?, 'active', ?)
      `).run(key, content, confidence, now);
    } catch {
      // memory_current may not exist in all schema versions — non-fatal
    }

    return jsonContent({ stored: true, type: chunkType, salience, session_id: sid });
  } catch (err) {
    return errContent(`Remember failed: ${err.message}`);
  }
}

async function handle_gigabrain_checkpoint({ summary, decisions = [], agent_id }) {
  const date = today();
  const now = new Date().toISOString();
  const stored = [];

  try {
    // Store summary as GOAL_UPDATE
    const summaryId = sessionId();
    db.prepare(`
      INSERT INTO context_chunks
        (session_id, session_date, chunk_type, source_type, content, agent_id,
         salience_score, classification_confidence, domains, created_at)
      VALUES (?, ?, 'GOAL_UPDATE', 'explicit', ?, ?, ?, 0.95, '[]', ?)
    `).run(summaryId, date, `[CHECKPOINT] ${summary}`, agent_id ?? null, SALIENCE_MAP.GOAL_UPDATE, now);
    stored.push({ type: 'GOAL_UPDATE', content: summary });

    // Store each decision as DECISION chunk
    for (const decision of decisions) {
      const did = sessionId();
      db.prepare(`
        INSERT INTO context_chunks
          (session_id, session_date, chunk_type, source_type, content, agent_id,
           salience_score, classification_confidence, domains, created_at)
        VALUES (?, ?, 'DECISION', 'explicit', ?, ?, ?, 0.95, '[]', ?)
      `).run(did, date, `[CHECKPOINT DECISION] ${decision}`, agent_id ?? null, SALIENCE_MAP.DECISION, now);
      stored.push({ type: 'DECISION', content: decision });
    }

    return jsonContent({ stored_count: stored.length, items: stored, date });
  } catch (err) {
    return errContent(`Checkpoint failed: ${err.message}`);
  }
}

async function handle_gigabrain_entity({ name, agent_id }) {
  try {
    // 1. Look up entity record
    const entity = tableExists('memory_entities')
      ? db.prepare(`SELECT * FROM memory_entities WHERE name LIKE ? LIMIT 1`).get(`%${name}%`)
      : null;

    // 2. Get beliefs for this entity
    let beliefs = [];
    if (entity && tableExists('memory_beliefs')) {
      beliefs = db.prepare(`
        SELECT claim, confidence, status, last_seen FROM memory_beliefs
        WHERE entity_id = ?
        ORDER BY confidence DESC
        LIMIT 20
      `).all(entity.id);
    }

    // 3. FTS search for chunks mentioning this entity
    let chunks = [];
    try {
      if (agent_id) {
        chunks = db.prepare(`
          SELECT c.chunk_type, c.session_date, c.content, c.salience_score
          FROM context_chunks_fts fts
          JOIN context_chunks c ON c.rowid = fts.rowid
          WHERE context_chunks_fts MATCH ? AND c.agent_id = ?
          ORDER BY bm25(context_chunks_fts)
          LIMIT 5
        `).all(name, agent_id);
      } else {
        chunks = db.prepare(`
          SELECT c.chunk_type, c.session_date, c.content, c.salience_score
          FROM context_chunks_fts fts
          JOIN context_chunks c ON c.rowid = fts.rowid
          WHERE context_chunks_fts MATCH ?
          ORDER BY bm25(context_chunks_fts)
          LIMIT 5
        `).all(name);
      }
    } catch {
      // FTS fallback
      chunks = db.prepare(`
        SELECT chunk_type, session_date, content, salience_score
        FROM context_chunks WHERE content LIKE ? ORDER BY salience_score DESC LIMIT 5
      `).all(`%${name}%`);
    }

    return jsonContent({ entity: entity ?? null, beliefs, chunks, name });
  } catch (err) {
    return errContent(`Entity lookup failed: ${err.message}`);
  }
}

async function handle_gigabrain_contradictions({ agent_id, limit = 20 }) {
  const results = { belief_contradictions: [], decision_conflicts: [] };

  // 1. Stored belief contradictions
  if (tableExists('belief_contradictions') && tableExists('memory_beliefs')) {
    try {
      const rows = db.prepare(`
        SELECT bc.id, bc.detected_at, bc.description,
               b1.claim AS belief_1, b2.claim AS belief_2
        FROM belief_contradictions bc
        JOIN memory_beliefs b1 ON bc.belief_id_1 = b1.id
        JOIN memory_beliefs b2 ON bc.belief_id_2 = b2.id
        WHERE bc.resolution IS NULL
        LIMIT ?
      `).all(limit);
      results.belief_contradictions = rows;
    } catch {
      // Non-fatal — table schema may differ
    }
  }

  // 2. Fast Jaccard check on recent DECISION chunks
  try {
    const recentSQL = agent_id
      ? `SELECT rowid, content, session_date FROM context_chunks
         WHERE chunk_type='DECISION' AND session_date >= date('now','-30 days') AND agent_id=?
         ORDER BY session_date DESC LIMIT 100`
      : `SELECT rowid, content, session_date FROM context_chunks
         WHERE chunk_type='DECISION' AND session_date >= date('now','-30 days')
         ORDER BY session_date DESC LIMIT 100`;

    const recent = agent_id
      ? db.prepare(recentSQL).all(agent_id)
      : db.prepare(recentSQL).all();

    const olderSQL = agent_id
      ? `SELECT rowid, content, session_date FROM context_chunks
         WHERE chunk_type='DECISION' AND session_date < date('now','-30 days') AND agent_id=?
         ORDER BY session_date DESC LIMIT 200`
      : `SELECT rowid, content, session_date FROM context_chunks
         WHERE chunk_type='DECISION' AND session_date < date('now','-30 days')
         ORDER BY session_date DESC LIMIT 200`;

    const older = agent_id
      ? db.prepare(olderSQL).all(agent_id)
      : db.prepare(olderSQL).all();

    for (const r of recent) {
      for (const o of older) {
        if (jaccardSimilarity(r.content, o.content) > 0.85) {
          results.decision_conflicts.push({
            newer: { date: r.session_date, content: r.content },
            older: { date: o.session_date, content: o.content },
            similarity: Math.round(jaccardSimilarity(r.content, o.content) * 100) / 100,
          });
          if (results.decision_conflicts.length >= 10) break;
        }
      }
      if (results.decision_conflicts.length >= 10) break;
    }
  } catch {
    // Non-fatal
  }

  return jsonContent({
    total: results.belief_contradictions.length + results.decision_conflicts.length,
    ...results,
  });
}

async function handle_gigabrain_patterns({ domain, agent_id }) {
  if (!tableExists('memory_patterns')) {
    return jsonContent({ patterns: [], note: 'memory_patterns table not found — run schema migration' });
  }

  try {
    let rows;
    if (domain && agent_id) {
      rows = db.prepare(`
        SELECT * FROM memory_patterns WHERE domain=? AND agent_id=? ORDER BY frequency DESC LIMIT 50
      `).all(domain, agent_id);
    } else if (domain) {
      rows = db.prepare(`
        SELECT * FROM memory_patterns WHERE domain=? ORDER BY frequency DESC LIMIT 50
      `).all(domain);
    } else if (agent_id) {
      rows = db.prepare(`
        SELECT * FROM memory_patterns WHERE agent_id=? ORDER BY frequency DESC LIMIT 50
      `).all(agent_id);
    } else {
      rows = db.prepare(`
        SELECT * FROM memory_patterns ORDER BY frequency DESC LIMIT 50
      `).all();
    }

    // If no patterns stored, run inline quick cluster
    if (rows.length === 0) {
      const chunks = db.prepare(`
        SELECT content, domains, session_date, agent_id FROM context_chunks
        WHERE chunk_type IN ('DECISION', 'INSIGHT', 'CORRECTION')
        ORDER BY session_date DESC LIMIT 500
      `).all();

      // Group by domain keyword
      const domainGroups = {};
      for (const c of chunks) {
        let parsedDomains = [];
        try { parsedDomains = JSON.parse(c.domains || '[]'); } catch {}
        const key = parsedDomains[0] ?? 'general';
        if (!domainGroups[key]) domainGroups[key] = [];
        domainGroups[key].push(c);
      }

      const inlinePatterns = [];
      for (const [dom, domChunks] of Object.entries(domainGroups)) {
        if (domChunks.length >= 3) {
          const sessions = new Set(domChunks.map(c => c.session_date));
          if (sessions.size >= 2) {
            inlinePatterns.push({
              domain: dom,
              frequency: domChunks.length,
              sessions: sessions.size,
              description: `${domChunks.length} decisions/insights across ${sessions.size} sessions`,
              sample: domChunks.slice(0, 3).map(c => c.content.slice(0, 80)),
            });
          }
        }
      }

      return jsonContent({ patterns: inlinePatterns, source: 'inline', stored_count: 0 });
    }

    return jsonContent({ patterns: rows, source: 'stored', count: rows.length });
  } catch (err) {
    return errContent(`Patterns failed: ${err.message}`);
  }
}

async function handle_gigabrain_stats() {
  try {
    // Chunk counts by agent and type
    const byAgentType = db.prepare(`
      SELECT agent_id, chunk_type, COUNT(*) AS count
      FROM context_chunks
      GROUP BY agent_id, chunk_type
      ORDER BY agent_id, count DESC
    `).all();

    // Total counts
    const totalChunks = db.prepare(`SELECT COUNT(*) AS n FROM context_chunks`).get()?.n ?? 0;
    const lastSession = db.prepare(`SELECT MAX(session_date) AS d FROM context_chunks`).get()?.d ?? null;

    // DB size
    let dbSizeBytes = 0;
    try { dbSizeBytes = statSync(dbPath).size; } catch {}

    // Schema version proxy
    const hasPatterns = tableExists('memory_patterns');
    const hasBeliefs = tableExists('memory_beliefs');
    const hasEvalRuns = tableExists('eval_runs');

    // Pattern count
    let patternCount = 0;
    if (hasPatterns) {
      try { patternCount = db.prepare(`SELECT COUNT(*) AS n FROM memory_patterns`).get()?.n ?? 0; } catch {}
    }

    // Eval run count
    let evalCount = 0;
    if (hasEvalRuns) {
      try { evalCount = db.prepare(`SELECT COUNT(*) AS n FROM eval_runs`).get()?.n ?? 0; } catch {}
    }

    // Agent list
    const agents = db.prepare(`SELECT DISTINCT agent_id FROM context_chunks WHERE agent_id IS NOT NULL`).all().map(r => r.agent_id);

    return jsonContent({
      db_path: dbPath,
      workspace: workspaceRoot,
      db_size_mb: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
      total_chunks: totalChunks,
      last_session: lastSession,
      agents,
      breakdown: byAgentType,
      schema: {
        version: hasPatterns && hasBeliefs ? 'v2' : 'v1',
        has_patterns: hasPatterns,
        has_beliefs: hasBeliefs,
        has_eval_runs: hasEvalRuns,
      },
      patterns: patternCount,
      eval_runs: evalCount,
    });
  } catch (err) {
    return errContent(`Stats failed: ${err.message}`);
  }
}

async function handle_gigabrain_workspace({ set_path }) {
  if (set_path) {
    try {
      const resolved = path.resolve(set_path);
      const cfg = loadConfig();
      cfg.workspaceRoot = resolved;
      saveConfig(cfg);
      return jsonContent({ updated: true, workspace: resolved, db_path: getDbPath() });
    } catch (err) {
      return errContent(`Failed to update workspace: ${err.message}`);
    }
  }

  return jsonContent({
    workspace: workspaceRoot,
    db_path: dbPath,
    config_source: process.env.OPENCLAW_WORKSPACE ? 'OPENCLAW_WORKSPACE env'
      : process.env.GIGABRAIN_WORKSPACE ? 'GIGABRAIN_WORKSPACE env'
      : 'registry.config.json or auto-detect',
  });
}

// ─── DISPATCH ─────────────────────────────────────────────────────────────────

const HANDLERS = {
  gigabrain_recall: handle_gigabrain_recall,
  gigabrain_remember: handle_gigabrain_remember,
  gigabrain_checkpoint: handle_gigabrain_checkpoint,
  gigabrain_entity: handle_gigabrain_entity,
  gigabrain_contradictions: handle_gigabrain_contradictions,
  gigabrain_patterns: handle_gigabrain_patterns,
  gigabrain_stats: handle_gigabrain_stats,
  gigabrain_workspace: handle_gigabrain_workspace,
};

// ─── MCP SERVER SETUP ─────────────────────────────────────────────────────────

const server = new Server(
  { name: SERVER_NAME, version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return errContent(`Unknown tool: ${name}`);
  }
  try {
    return await handler(args ?? {});
  } catch (err) {
    return errContent(`Error in ${name}: ${err.message}`);
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

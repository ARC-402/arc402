/**
 * extensions/lossless-memory/index.ts — Phase 3: OpenClaw Plugin
 * Lossless context engine for GigaBrain.
 * - ingest: writes new turns to Layer 0 (session_turns) + Layer 1 (context_chunks)
 * - compact: stores full content to context_chunks (never discards), returns stub
 * - assemble: detect_domain from recent turns, tiered retrieval, inject as system message
 *
 * NOT activated in config — leave for human review.
 * Plugin file is ready; activate by adding to openclaw.json plugins config.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDatabase } from './lib/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── DOMAIN KEYWORDS (shared with ingest-sessions.js) ────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  trading:   ['trading', 'phase404', 'hyperliquid', 'binance', 'position', 'equity', 'ticker', 'backtest', 'pnl', 'long', 'short', 'leverage'],
  content:   ['content', 'clip', 'episode', 'untethered', 'youtube', 'transcript', 'hook', 'caption', 'video', 'post'],
  brand:     ['brand', 'codex', 'voice', 'strategy', 'blaen', 'positioning', 'archetype', 'gigabrain', 'legogigabrain'],
  systems:   ['system', 'cron', 'gateway', 'registry', 'plugin', 'agent', 'memory', 'schema', 'spec', 'openclaw', 'pipeline', 'database'],
  spiritual: ['spiritual', 'mystic', 'desert', 'calling', 'god', 'prayer', 'untethered', 'purpose', 'soul', 'faith'],
  vlossom:   ['vlossom', 'smart contract', 'solidity', 'blockchain', 'mainnet', 'relayer', 'ethereum'],
  godnii:    ['godnii', 'blender', 'eyewear', '3d', 'parametric', 'render'],
  business:  ['client', 'revenue', 'proposal', 'retainer', 'invoice', 'workshop', 'core'],
};

// ─── SALIENCE MAP ─────────────────────────────────────────────────────────────

const SALIENCE_MAP: Record<string, number> = {
  DECISION:         1.0,
  CORRECTION:       1.0,
  INSIGHT:          0.9,
  ARCHITECTURE:     0.85,
  EMOTIONAL_SIGNAL: 0.8,
  CONTENT_SEED:     0.75,
  GOAL_UPDATE:      0.75,
  CONVERSATION:     0.4,
  TOOL_RESULT:      0.2,
  CRON_EVENT:       0.1,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Array<{type?: string; text?: string}>)
      .filter(b => b && b.type === 'text')
      .map(b => b.text || '')
      .join('\n')
      .trim();
  }
  return '';
}

function detectDomains(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([_, keywords]) => keywords.some(k => lower.includes(k)))
    .map(([domain]) => domain);
}

function detectCurrentDomain(messages: Array<{role: string; content: unknown}>): string[] {
  const recentText = messages
    .slice(-5)
    .map(m => extractText(m.content))
    .join(' ')
    .toLowerCase();

  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([_, keywords]) => keywords.some(k => recentText.includes(k)))
    .map(([domain]) => domain);
}

// Keyword classification (fast pass)
function classifyKeyword(text: string, role: string): { type: string; confidence: number } {
  if (!text?.trim()) return { type: 'CONVERSATION', confidence: 0.5 };

  // ── Pre-filter: structural noise that should never be classified as signal ──
  // Message envelopes, queue headers, system events, runtime injections
  if (
    /Conversation info \(untrusted metadata\)|"message_id":|"sender_id":/.test(text) ||
    /^\[Queued messages while agent was busy\]/i.test(text.trim()) ||
    /^System: \[\d{4}-\d{2}-\d{2}/.test(text.trim()) ||
    /OpenClaw runtime context \(internal\)|This context is runtime-generated/i.test(text) ||
    /Before compaction: write to memory\/\d{4}-\d{2}-\d{2}\.md/i.test(text)
  ) {
    return { type: 'CONVERSATION', confidence: 0.1 };
  }

  // ── Explicit captures: always trust the [CAPTURE:TYPE] prefix ──────────────
  const captureMatch = text.match(/^\[CAPTURE:([A-Z_]+)\]/);
  if (captureMatch) {
    const type = captureMatch[1];
    const VALID = new Set(['DECISION','CORRECTION','INSIGHT','ARCHITECTURE','GOAL_UPDATE','PREFERENCE','CONTENT_SEED','EMOTIONAL_SIGNAL']);
    if (VALID.has(type)) return { type, confidence: 0.99 };
  }

  const len = text.length;

  // ── CORRECTION — only short, pointed assistant corrections (< 500 chars) ───
  // Long messages containing "let me correct" are almost always status reports
  if (
    role === 'assistant' && len < 500 &&
    /you said|that'?s (not right|wrong)|actually,?\s+(no|that'?s)|let me correct|wait,?\s+that'?s wrong/i.test(text)
  ) {
    return { type: 'CORRECTION', confidence: 0.8 };
  }

  // ── DECISION — locked-in operational rules, short and direct ───────────────
  // Must be assistant-authored, not a question, under 800 chars
  if (
    role === 'assistant' && len < 800 && !/\?$/.test(text.trim()) &&
    /we'?re going with|locked in|from now on|that'?s the decision|we decided|do NOT|never deploy|always use\b/i.test(text)
  ) {
    return { type: 'DECISION', confidence: 0.8 };
  }

  // ── INSIGHT — pattern recognition, explicit realizations ──────────────────
  if (/this is the same pattern|here'?s what I realized|breakthrough|I just realized|the pattern is/i.test(text)) {
    return { type: 'INSIGHT', confidence: 0.65 };
  }

  // ── ARCHITECTURE — spec/schema references, must have technical grounding ───
  // Require multiple signals to avoid single-word false positives
  if (
    /the spec (says|is)|the schema (is|shows)|let'?s wire\b/i.test(text) ||
    (/\b(architecture|file structure)\b/i.test(text) && /\b(contract|component|system|layer|spec)\b/i.test(text))
  ) {
    return { type: 'ARCHITECTURE', confidence: 0.7 };
  }

  // ── EMOTIONAL_SIGNAL — personal/spiritual, user-only ──────────────────────
  if (
    role === 'user' &&
    /I feel\b|honestly[,.]|this is hard|desert|calling\b|\bgod\b|purpose\b|soul\b/i.test(text)
  ) {
    return { type: 'EMOTIONAL_SIGNAL', confidence: 0.7 };
  }

  // ── CONTENT_SEED — explicit content signal ────────────────────────────────
  if (/this could be a post|content angle|people need to hear|hook:|episode idea/i.test(text)) {
    return { type: 'CONTENT_SEED', confidence: 0.7 };
  }

  // ── GOAL_UPDATE — completion signal, must be short and declarative ─────────
  // "done" alone on a long message is almost always noise
  if (
    len < 600 &&
    /\bshipped\b|\bblocked\b|we finished|it'?s live|launched\b/i.test(text)
  ) {
    return { type: 'GOAL_UPDATE', confidence: 0.7 };
  }
  // "done" only counts as signal when it's the dominant word in a short message
  if (len < 200 && /^\s*(done|all done|✅|shipped)[^a-z]/i.test(text)) {
    return { type: 'GOAL_UPDATE', confidence: 0.65 };
  }

  return { type: 'CONVERSATION', confidence: 0.5 };
}

function estimateTokens(messages: Array<{content: unknown}>): number {
  return messages.reduce((sum, m) => sum + Math.ceil(extractText(m.content).length / 4), 0);
}

function fitToTokenBudget<T extends {content: unknown}>(messages: T[], budget: number): T[] {
  const result: T[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = Math.ceil(extractText(messages[i].content).length / 4);
    if (used + tokens > budget) break;
    result.unshift(messages[i]);
    used += tokens;
  }
  return result;
}

function fitChunksToBudget<T extends {content: string}>(chunks: T[], budget: number): T[] {
  const result: T[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const tokens = Math.ceil(chunk.content.length / 4);
    if (used + tokens > budget) break;
    result.push(chunk);
    used += tokens;
  }
  return result;
}

// ─── BM25 + RECENCY SCORING ─────────────────────────────────────────────────

function recencyDecay(sessionDate: string): number {
  const days = (Date.now() - Date.parse(sessionDate)) / 86400000;
  if (days <= 1)   return 0.25;
  if (days <= 7)   return 0.20;
  if (days <= 30)  return 0.15;
  if (days <= 90)  return 0.08;
  if (days <= 365) return 0.04;
  return 0.01;
}

function compositeScore(bm25Rank: number, salienceScore: number, sessionDate: string): number {
  const bm25Normalized = bm25Rank / (bm25Rank + 4);
  const recency = recencyDecay(sessionDate);
  return bm25Normalized * salienceScore * (1 + recency);
}

// ─── RETRIEVAL DEDUPLICATION ─────────────────────────────────────────────────

function normalizeForDedup(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[`*_>#[\]]/g, '')
    .trim()
    .slice(0, 200);
}

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForDedup(a).split(' '));
  const tokensB = new Set(normalizeForDedup(b).split(' '));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function dedupeChunks<T extends {content: string}>(chunks: T[]): T[] {
  const result: T[] = [];
  for (const chunk of chunks) {
    const normA = normalizeForDedup(chunk.content);
    const isDup = result.some(existing => {
      const normB = normalizeForDedup(existing.content);
      if (normA === normB) return true;
      if (normA.slice(0, 80) === normB.slice(0, 80)) return true;
      return jaccardSimilarity(chunk.content, existing.content) >= 0.88;
    });
    if (!isDup) result.push(chunk);
  }
  return result;
}

// ─── STALE TIME DETECTION + PROVENANCE HEADERS ───────────────────────────────

const RELATIVE_TIME_RE = /\b(today|tonight|yesterday|currently|right now|at the moment|this morning|this week|this month|just now|recently|lately)\b/i;

type AnnotatedChunk = MemoryChunk & { has_relative_time?: number };

function annotateChunkForInjection(chunk: AnnotatedChunk): string {
  const ageDays = Math.floor((Date.now() - Date.parse(chunk.session_date)) / 86400000);
  const ageStr = ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;
  const staleWarning = chunk.has_relative_time && ageDays > 1
    ? ` ⚠ relative dates refer to ${chunk.session_date}`
    : '';
  return `[${chunk.chunk_type} — ${chunk.session_date} — ${ageStr}${staleWarning}]: ${chunk.content}`;
}

// ─── QUERY SANITIZATION ──────────────────────────────────────────────────────

function sanitizeQuery(query: string): string {
  return query
    .replace(/\[[\w\s]+—[\s\d-]+\]:/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[.*?\]\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

// ─── QUALITY FILTERING ───────────────────────────────────────────────────────

const JUNK_RE = /^(ok|okay|sure|yes|no|got it|understood|noted|alright|sounds good|perfect|great|thanks|thank you|lgtm|👍|✅)[\s.!]*$/i;

function meetsQualityThreshold(content: string, chunkType: string): boolean {
  if (chunkType !== 'CONVERSATION') return true;
  const trimmed = content.trim();
  if (trimmed.length < 40) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 8) return false;
  if (JUNK_RE.test(trimmed)) return false;
  return true;
}

// ─── CONTRADICTION DETECTION ─────────────────────────────────────────────────

type ContradictionAlert = { chunkA: AnnotatedChunk; chunkB: AnnotatedChunk; resolution: string };

const NEGATION_PAIRS: [RegExp, RegExp][] = [
  [/\buse\b/i,     /\bdon'?t use\b/i],
  [/\bbuild\b/i,   /\bdon'?t build\b/i],
  [/\bdeploy\b/i,  /\bdon'?t deploy\b/i],
  [/\bpublish\b/i, /\bdon'?t publish\b/i],
  [/\benable\b/i,  /\bdisable\b/i],
  [/\bkeep\b/i,    /\bremove\b/i],
  [/\bstart\b/i,   /\bstop\b/i],
];

function detectInjectionContradictions(chunks: AnnotatedChunk[]): ContradictionAlert[] {
  const alerts: ContradictionAlert[] = [];
  const decisionChunks = chunks.filter(c => c.chunk_type === 'DECISION');
  for (let i = 0; i < decisionChunks.length; i++) {
    for (let j = i + 1; j < decisionChunks.length; j++) {
      const a = decisionChunks[i];
      const b = decisionChunks[j];
      for (const [posRe, negRe] of NEGATION_PAIRS) {
        const aHasPos = posRe.test(a.content) && !negRe.test(a.content);
        const bHasNeg = negRe.test(b.content) && !posRe.test(b.content);
        const bHasPos = posRe.test(b.content) && !negRe.test(b.content);
        const aHasNeg = negRe.test(a.content) && !posRe.test(a.content);
        if ((aHasPos && bHasNeg) || (bHasPos && aHasNeg)) {
          alerts.push({
            chunkA: a,
            chunkB: b,
            resolution: a.session_date > b.session_date ? 'a_supersedes' : 'b_supersedes',
          });
          break;
        }
      }
    }
  }
  return alerts;
}

// ─── WORKING MEMORY ───────────────────────────────────────────────────────────

function getWorkingMemory(db: ReturnType<typeof openDatabase>, agentId?: string): string | null {
  try {
    const agentFilter = agentId ? `AND source_agent = ?` : '';
    const rows = db.prepare(`
      SELECT type, content, value_score, last_recalled
      FROM memory_current
      WHERE status = 'active'
        AND value_score >= 0.7
        ${agentFilter}
      ORDER BY value_score DESC, last_recalled DESC
      LIMIT 10
    `).all(...(agentId ? [agentId] : [])) as Array<{type: string; content: string; value_score: number; last_recalled: string}>;
    if (rows.length === 0) return null;
    const lines = rows.map(r => `[${r.type}]: ${r.content}`).join('\n');
    return `[Working Memory — ${rows.length} active items]\n\n${lines}`;
  } catch {
    return null;
  }
}

// ─── SEMANTIC RECALL (nomic-embed-text + cosine similarity) ──────────────────

/**
 * Fetch a query embedding from local Ollama.
 * Returns null if Ollama is unavailable — caller falls back to BM25-only.
 */
async function getQueryEmbedding(text: string): Promise<Float32Array | null> {
  try {
    const resp = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { embedding: number[] };
    if (!Array.isArray(data.embedding)) return null;
    return new Float32Array(data.embedding);
  } catch {
    return null;
  }
}

/** Pure JS cosine similarity — no extensions needed. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Full BLOB scan — computes cosine against every embedded chunk.
 * 11ms for ~7,500 chunks (Float32Array, pure JS). No extension needed.
 */
function semanticRecall(
  db: ReturnType<typeof openDatabase>,
  queryEmbedding: Float32Array,
  agentId: string | undefined,
  limit = 8
): MemoryChunk[] {
  const agentCondition = agentId ? `AND agent_id = ?` : '';
  const params: unknown[] = agentId ? [agentId] : [];

  const rows = db.prepare(`
    SELECT id, content, chunk_type, session_date, classification_confidence,
           salience_score, has_relative_time, embedding
    FROM context_chunks
    WHERE embedding IS NOT NULL
      AND chunk_type NOT IN ('CONVERSATION', 'CRON_EVENT', 'TOOL_RESULT')
      ${agentCondition}
  `).all(...params) as Array<{
    id: string; content: string; chunk_type: string; session_date: string;
    classification_confidence: number; salience_score: number;
    has_relative_time: number; embedding: Buffer;
  }>;

  type ScoredChunk = MemoryChunk & { _semanticScore: number };

  const scored: ScoredChunk[] = rows
    .map(row => {
      const vec = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4
      );
      const score = cosine(queryEmbedding, vec);
      return {
        content: row.content,
        chunk_type: row.chunk_type,
        session_date: row.session_date,
        classification_confidence: row.classification_confidence,
        salience_score: row.salience_score,
        has_relative_time: row.has_relative_time,
        _semanticScore: score,
      };
    })
    .filter(r => r._semanticScore > 0.5)
    .sort((a, b) => b._semanticScore - a._semanticScore)
    .slice(0, limit);

  return scored.map(({ _semanticScore: _, ...rest }) => rest);
}

// ─── RECALL STRATEGY ROUTER ──────────────────────────────────────────────────

type RecallStrategy = 'entity' | 'timeline' | 'decision' | 'verification' | 'general';

/**
 * Classify the last user message to determine the optimal recall strategy.
 * This is the intelligence layer between "heard something" and "retrieves something."
 *
 * - entity:       "who is...", "tell me about...", person/project names
 * - timeline:     "what happened...", "last week...", "when did...", "today", "yesterday"
 * - decision:     "did we decide...", "what's the plan...", "what did we agree..."
 * - verification: "didn't I say...", "I thought we...", "wasn't it...", contradictions
 * - general:      fallback — domain-based retrieval (current behavior)
 */
function classifyRecallStrategy(messages: Array<{role: string; content: unknown}>): RecallStrategy {
  // Get the last 2 user messages for classification
  const userMessages = messages.filter(m => m.role === 'user').slice(-2);
  if (userMessages.length === 0) return 'general';

  const lastUserText = sanitizeQuery(extractText(userMessages[userMessages.length - 1].content)).toLowerCase();

  // Verification — must check first (contains "didn't" patterns that overlap with others)
  if (/didn'?t (i|we|you) (say|decide|agree|mention)|i thought (we|you|i)|wasn'?t it|contradicts?|opposite of what|changed (your|my|our) mind|are you sure/i.test(lastUserText)) {
    return 'verification';
  }

  // Entity — person, project, or concept lookup
  if (/who is|tell me about|what (is|do you know about)|what'?s .{1,30} status|update on |how is .{1,30} doing|remind me (about|who)/i.test(lastUserText)) {
    return 'entity';
  }

  // Timeline — temporal queries
  if (/what happened|last (week|month|session|time)|when did|yesterday|today|this morning|this week|recently|timeline|history of|sequence of|chronolog/i.test(lastUserText)) {
    return 'timeline';
  }

  // Decision — recall of past choices, plans, agreements
  if (/did we (decide|agree|choose|settle|lock)|what'?s the plan|what did we (agree|decide|say about)|the decision (was|on|about)|we (decided|agreed|locked|chose)|current (plan|approach|strategy) for/i.test(lastUserText)) {
    return 'decision';
  }

  return 'general';
}

// ─── STRATEGY-SPECIFIC RETRIEVAL ─────────────────────────────────────────────

type MemoryChunk = {content: string; chunk_type: string; session_date: string; classification_confidence: number; salience_score?: number; has_relative_time?: number};

function retrieveEntityBrief(
  db: ReturnType<typeof openDatabase>,
  messages: Array<{role: string; content: unknown}>,
  budget: number,
  agentId?: string
): MemoryChunk[] {
  const agentCondition = agentId ? `AND agent_id = ?` : '';
  const agentParam = agentId ? [agentId] : [];
  const lastUserText = extractText(messages.filter(m => m.role === 'user').slice(-1)[0]?.content).toLowerCase();

  // Extract likely entity name (rough heuristic: words after "who is" / "about" / capitalized words)
  const entityMatch = lastUserText.match(/(?:who is|tell me about|about|update on|status of)\s+([a-z0-9\s\-]+)/i);
  const entityHint = entityMatch ? entityMatch[1].trim() : '';

  // Try world model entities first
  let entityChunks: MemoryChunk[] = [];
  try {
    if (entityHint) {
      // Search beliefs about this entity
      const beliefs = db.prepare(`
        SELECT b.belief_text as content, 'BELIEF' as chunk_type, b.session_date,
               b.confidence as classification_confidence
        FROM memory_beliefs b
        JOIN memory_entities e ON b.entity_id = e.id
        WHERE LOWER(e.name) LIKE ?
          AND b.superseded_by IS NULL
        ORDER BY b.confidence DESC
        LIMIT 10
      `).all(`%${entityHint}%`) as MemoryChunk[];
      entityChunks.push(...beliefs);
    }
  } catch { /* world model tables may not exist */ }

  // Also pull FTS matches from context_chunks
  try {
    if (entityHint) {
      const ftsResults = db.prepare(`
        SELECT c.content, c.chunk_type, c.session_date, c.classification_confidence,
               c.salience_score, c.has_relative_time
        FROM context_chunks_fts
        JOIN context_chunks c ON c.rowid = context_chunks_fts.rowid
        WHERE context_chunks_fts MATCH ?
          AND c.chunk_type IN ('DECISION', 'INSIGHT', 'ARCHITECTURE', 'GOAL_UPDATE')
          AND c.source_type = 'verbatim'
          ${agentCondition}
        ORDER BY (context_chunks_fts.rank * -1 * c.salience_score) DESC
        LIMIT 10
      `).all(entityHint.replace(/[^\w\s]/g, ''), ...agentParam) as MemoryChunk[];
      entityChunks.push(...ftsResults);
    }
  } catch { /* FTS might not be ready */ }

  // Also pull episodes mentioning this entity
  try {
    if (entityHint) {
      const episodes = db.prepare(`
        SELECT ep.description as content, 'EPISODE' as chunk_type, ep.session_date,
               0.8 as classification_confidence
        FROM memory_episodes ep
        WHERE LOWER(ep.description) LIKE ?
        ORDER BY ep.session_date DESC
        LIMIT 5
      `).all(`%${entityHint}%`) as MemoryChunk[];
      entityChunks.push(...episodes);
    }
  } catch { /* ignore */ }

  return fitChunksToBudget(entityChunks, budget);
}

function retrieveTimeline(
  db: ReturnType<typeof openDatabase>,
  messages: Array<{role: string; content: unknown}>,
  budget: number,
  agentId?: string
): MemoryChunk[] {
  const agentCondition = agentId ? `AND agent_id = ?` : '';
  const agentParam = agentId ? [agentId] : [];
  const lastUserText = extractText(messages.filter(m => m.role === 'user').slice(-1)[0]?.content).toLowerCase();

  // Determine time window
  let dateFilter = "date('now', '-7 days')"; // default: last week
  if (/yesterday/.test(lastUserText)) dateFilter = "date('now', '-1 day')";
  else if (/today|this morning/.test(lastUserText)) dateFilter = "date('now')";
  else if (/last month/.test(lastUserText)) dateFilter = "date('now', '-30 days')";
  else if (/this week/.test(lastUserText)) dateFilter = "date('now', '-7 days')";
  else if (/last session/.test(lastUserText)) dateFilter = "date('now', '-2 days')";

  let timelineChunks: MemoryChunk[] = [];

  // Pull episodes chronologically
  try {
    const episodes = db.prepare(`
      SELECT description as content, 'EPISODE' as chunk_type, session_date,
             0.85 as classification_confidence
      FROM memory_episodes
      WHERE session_date >= ${dateFilter}
      ORDER BY session_date ASC, created_at ASC
      LIMIT 15
    `).all() as MemoryChunk[];
    timelineChunks.push(...episodes);
  } catch { /* ignore */ }

  // Fill with high-signal chunks from the time window, ordered chronologically
  try {
    const chunks = db.prepare(`
      SELECT content, chunk_type, session_date, classification_confidence
      FROM context_chunks
      WHERE session_date >= ${dateFilter}
        AND chunk_type IN ('DECISION', 'INSIGHT', 'GOAL_UPDATE', 'ARCHITECTURE')
        AND source_type = 'verbatim'
        ${agentCondition}
      ORDER BY session_date ASC, turn_index ASC
      LIMIT 20
    `).all(...agentParam) as MemoryChunk[];
    timelineChunks.push(...chunks);
  } catch { /* ignore */ }

  // Sort combined results chronologically
  timelineChunks.sort((a, b) => a.session_date.localeCompare(b.session_date));

  return fitChunksToBudget(timelineChunks, budget);
}

function retrieveDecisions(
  db: ReturnType<typeof openDatabase>,
  messages: Array<{role: string; content: unknown}>,
  budget: number,
  currentDomains: string[],
  agentId?: string
): MemoryChunk[] {
  const agentCondition = agentId ? `AND c.agent_id = ?` : '';
  const agentParam = agentId ? [agentId] : [];
  const domainCondition = currentDomains.length > 0
    ? `AND EXISTS (SELECT 1 FROM json_each(c.domains) WHERE ${currentDomains.map(() => 'json_each.value = ?').join(' OR ')})`
    : '';

  let decisionChunks: MemoryChunk[] = [];
  try {
    const stmt = db.prepare(`
      SELECT c.content, c.chunk_type, c.session_date, c.classification_confidence,
             c.salience_score, c.has_relative_time
      FROM context_chunks c
      WHERE c.chunk_type IN ('DECISION', 'CORRECTION')
        AND c.source_type = 'verbatim'
        ${domainCondition}
        ${agentCondition}
      ORDER BY c.salience_score DESC, c.session_date DESC
      LIMIT 20
    `);
    decisionChunks = stmt.all(...currentDomains, ...agentParam) as MemoryChunk[];
    // Post-sort with recency decay as tiebreaker
    decisionChunks.sort((a, b) => {
      const scoreA = (a.salience_score ?? 0.5) * (1 + recencyDecay(a.session_date));
      const scoreB = (b.salience_score ?? 0.5) * (1 + recencyDecay(b.session_date));
      return scoreB - scoreA;
    });
  } catch { /* ignore */ }

  return fitChunksToBudget(decisionChunks, budget);
}

function retrieveVerification(
  db: ReturnType<typeof openDatabase>,
  messages: Array<{role: string; content: unknown}>,
  budget: number,
  agentId?: string
): MemoryChunk[] {
  const agentCondition = agentId ? `AND agent_id = ?` : '';
  const agentParam = agentId ? [agentId] : [];
  let verificationChunks: MemoryChunk[] = [];

  // Pull contradictions first — this is the primary verification source
  try {
    const contradictions = db.prepare(`
      SELECT
        'CONTRADICTION: ' || bc.belief_a_text || ' vs ' || bc.belief_b_text || ' (similarity: ' || bc.similarity_score || ')' as content,
        'CONTRADICTION' as chunk_type,
        bc.detected_at as session_date,
        bc.similarity_score as classification_confidence
      FROM belief_contradictions bc
      WHERE bc.resolution IS NULL
      ORDER BY bc.detected_at DESC
      LIMIT 10
    `).all() as MemoryChunk[];
    verificationChunks.push(...contradictions);
  } catch { /* ignore */ }

  // Pull recent corrections — shows what was wrong before
  try {
    const corrections = db.prepare(`
      SELECT content, chunk_type, session_date, classification_confidence
      FROM context_chunks
      WHERE chunk_type = 'CORRECTION'
        AND source_type = 'verbatim'
        ${agentCondition}
      ORDER BY session_date DESC
      LIMIT 10
    `).all(...agentParam) as MemoryChunk[];
    verificationChunks.push(...corrections);
  } catch { /* ignore */ }

  // Pull superseded beliefs — shows what changed
  try {
    const superseded = db.prepare(`
      SELECT
        'SUPERSEDED: ' || b.belief_text || ' → replaced by belief ' || b.superseded_by as content,
        'BELIEF_CHANGE' as chunk_type,
        b.session_date,
        b.confidence as classification_confidence
      FROM memory_beliefs b
      WHERE b.superseded_by IS NOT NULL
      ORDER BY b.session_date DESC
      LIMIT 8
    `).all() as MemoryChunk[];
    verificationChunks.push(...superseded);
  } catch { /* ignore */ }

  return fitChunksToBudget(verificationChunks, budget);
}

// ─── INGEST HOOK ──────────────────────────────────────────────────────────────

async function handleIngest(ctx: {
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  messages?: Array<{role: string; content: unknown}>;
  newMessages?: Array<{role: string; content: unknown}>;
}) {
  const { sessionId, sessionKey, agentId: explicitAgentId, messages = [], newMessages } = ctx;
  const agentId = deriveAgentIdFromSessionKey(sessionKey, explicitAgentId) ?? 'main';
  const db = openDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const toIngest = newMessages || messages;
  let ingested = 0;

  // Also write to Layer 0 (session_turns) — keep raw index current
  const insertTurn = db.prepare(`
    INSERT OR IGNORE INTO session_turns
    (id, session_id, turn_index, role, content, session_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // UPSERT: upgrade chunk_type/salience if new classification is better than existing.
  // Fixes the INSERT OR IGNORE bug where historical ingest's CRON_EVENT blocks live reclassification.
  const insertChunk = db.prepare(`
    INSERT INTO context_chunks
    (id, session_id, agent_id, session_date, turn_index, role, chunk_type,
     content, token_estimate, salience_score, classification_confidence,
     domains, tags, source_type, has_relative_time, created_at, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'verbatim', ?, ?, ?)
    ON CONFLICT(session_id, turn_index) DO UPDATE SET
      chunk_type = CASE WHEN excluded.salience_score > context_chunks.salience_score
                        THEN excluded.chunk_type ELSE context_chunks.chunk_type END,
      salience_score = MAX(excluded.salience_score, context_chunks.salience_score),
      classification_confidence = CASE WHEN excluded.salience_score > context_chunks.salience_score
                                       THEN excluded.classification_confidence
                                       ELSE context_chunks.classification_confidence END,
      domains = CASE WHEN excluded.salience_score > context_chunks.salience_score
                     THEN excluded.domains ELSE context_chunks.domains END,
      has_relative_time = CASE WHEN excluded.salience_score > context_chunks.salience_score
                               THEN excluded.has_relative_time ELSE context_chunks.has_relative_time END,
      indexed_at = excluded.indexed_at
    WHERE excluded.salience_score > context_chunks.salience_score
  `);

  for (const [index, msg] of toIngest.entries()) {
    if (msg.role === 'tool' || msg.role === 'toolResult') continue;

    const content = extractText(msg.content);
    if (!content.trim()) continue;

    const { type, confidence } = classifyKeyword(content, msg.role);
    const domains = detectDomains(content);
    const salience = SALIENCE_MAP[type] ?? 0.4;
    const tokenEstimate = Math.ceil(content.length / 4);

    // Layer 0: raw turn (always lossless)
    try {
      insertTurn.run(randomUUID(), sessionId, index, msg.role, content, today);
    } catch {
      // Ignore FTS or duplicate errors
    }

    // Quality filter: skip low-quality CONVERSATION chunks for Layer 1 (Layer 0 stays lossless)
    if (!meetsQualityThreshold(content, type)) continue;

    // Layer 1: classified chunk
    try {
      const hasRelativeTime = RELATIVE_TIME_RE.test(content) ? 1 : 0;
      const result = insertChunk.run(
        randomUUID(), sessionId, agentId, today, index,
        msg.role, type, content, tokenEstimate,
        salience, confidence, JSON.stringify(domains),
        hasRelativeTime, now, now
      );
      if (result.changes > 0) ingested++;
    } catch {
      // Ignore
    }
  }

  db.close();
  return { ingested };
}

// ─── COMPACT HOOK — THE LOSSLESS CORE ────────────────────────────────────────

async function handleCompact(ctx: {
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  messages?: Array<{role: string; content: unknown}>;
  compactRange?: { start: number; end: number };
}) {
  const { sessionId, sessionKey, agentId: explicitAgentId, messages = [], compactRange } = ctx;
  const agentId = deriveAgentIdFromSessionKey(sessionKey, explicitAgentId) ?? 'main';
  const db = openDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const messagesToCompact = compactRange
    ? messages.slice(compactRange.start, compactRange.end)
    : messages;

  const insertChunk = db.prepare(`
    INSERT INTO context_chunks
    (id, session_id, agent_id, session_date, turn_index, role, chunk_type,
     content, token_estimate, salience_score, classification_confidence,
     domains, tags, source_type, compacted, has_relative_time, created_at, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'verbatim', 1, ?, ?, ?)
    ON CONFLICT(session_id, turn_index) DO UPDATE SET
      chunk_type = CASE WHEN excluded.salience_score > context_chunks.salience_score
                        THEN excluded.chunk_type ELSE context_chunks.chunk_type END,
      salience_score = MAX(excluded.salience_score, context_chunks.salience_score),
      classification_confidence = CASE WHEN excluded.salience_score > context_chunks.salience_score
                                       THEN excluded.classification_confidence
                                       ELSE context_chunks.classification_confidence END,
      domains = CASE WHEN excluded.salience_score > context_chunks.salience_score
                     THEN excluded.domains ELSE context_chunks.domains END,
      compacted = 1,
      has_relative_time = CASE WHEN excluded.salience_score > context_chunks.salience_score
                               THEN excluded.has_relative_time ELSE context_chunks.has_relative_time END,
      indexed_at = excluded.indexed_at
    WHERE excluded.salience_score > context_chunks.salience_score
  `);

  const insertTurn = db.prepare(`
    INSERT OR IGNORE INTO session_turns
    (id, session_id, turn_index, role, content, session_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let compacted = 0;

  // node:sqlite uses manual BEGIN/COMMIT, no .transaction() method
  db.exec('BEGIN');
  const doStore = () => {
    for (const [index, msg] of messagesToCompact.entries()) {
      const content = extractText(msg.content);
      if (!content.trim()) continue;

      const { type, confidence } = classifyKeyword(content, msg.role);
      const domains = detectDomains(content);

      // Layer 0 (always lossless)
      try {
        insertTurn.run(randomUUID(), sessionId,
          (compactRange?.start ?? 0) + index,
          msg.role, content, today);
      } catch { /* ignore */ }

      // Quality filter: skip low-quality CONVERSATION chunks for Layer 1
      if (!meetsQualityThreshold(content, type)) continue;

      // Layer 1
      try {
        const hasRelativeTime = RELATIVE_TIME_RE.test(content) ? 1 : 0;
        const result = insertChunk.run(
          randomUUID(), sessionId, agentId, today,
          (compactRange?.start ?? 0) + index,
          msg.role, type, content, Math.ceil(content.length / 4),
          SALIENCE_MAP[type] ?? 0.4, confidence,
          JSON.stringify(domains), hasRelativeTime, now, now
        );
        if (result.changes > 0) compacted++;
      } catch { /* ignore */ }
    }
  };

  try {
    doStore();
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
  }

  const topicSummary = detectDomains(
    messagesToCompact.map(m => extractText(m.content)).join(' ')
  ).join(', ');

  db.close();

  // Return stub as system message — nothing discarded, everything stored
  const stub = {
    role: 'system',
    content: `[Memory: ${messagesToCompact.length} messages compacted to lossless store. Topics: ${topicSummary || 'general'}. Full content retrievable. Session continues.]`,
  };

  return { ok: true, compacted: true, stub, storedCount: compacted };
}

// ─── LAST SESSION BOOTSTRAP ───────────────────────────────────────────────────

/**
 * Get the most recent prior session's high-signal chunks.
 * Used to give fresh sessions hot continuity with the last conversation.
 * Skips cron sessions (sessions with only CRON_EVENT chunks) and heartbeat sessions.
 */
function getLastSessionContext(db: ReturnType<typeof openDatabase>, currentSessionId?: string, agentId?: string): string | null {
  try {
    // Find the most recent session that has meaningful (non-cron) turns
    const sessionIdFilter = currentSessionId ? `AND session_id != ?` : '';
    const agentFilter = agentId ? `AND agent_id = ?` : '';
    const sessionParams: unknown[] = [];
    if (currentSessionId) sessionParams.push(currentSessionId);
    if (agentId) sessionParams.push(agentId);

    const lastSession = db.prepare(`
      SELECT session_id, session_date, COUNT(*) as turn_count
      FROM context_chunks
      WHERE chunk_type NOT IN ('CRON_EVENT', 'TOOL_RESULT')
        AND role IN ('user', 'assistant')
        ${sessionIdFilter}
        ${agentFilter}
      GROUP BY session_id
      HAVING turn_count >= 3
      ORDER BY session_date DESC, MAX(turn_index) DESC
      LIMIT 1
    `).get(...sessionParams) as { session_id: string; session_date: string; turn_count: number } | undefined;

    if (!lastSession) return null;

    // Pull high-salience chunks from that session, ordered by turn flow
    const chunks = db.prepare(`
      SELECT chunk_type, role, content, turn_index
      FROM context_chunks
      WHERE session_id = ?
        AND chunk_type IN ('DECISION', 'CORRECTION', 'INSIGHT', 'ARCHITECTURE', 'GOAL_UPDATE', 'CONTENT_SEED', 'EMOTIONAL_SIGNAL')
      ORDER BY turn_index ASC
      LIMIT 25
    `).all(lastSession.session_id) as Array<{chunk_type: string; role: string; content: string; turn_index: number}>;

    if (chunks.length === 0) {
      // Fall back: take last 10 conversation turns verbatim
      const convoTurns = db.prepare(`
        SELECT role, content, turn_index
        FROM context_chunks
        WHERE session_id = ?
          AND role IN ('user', 'assistant')
        ORDER BY turn_index DESC
        LIMIT 10
      `).all(lastSession.session_id) as Array<{role: string; content: string; turn_index: number}>;

      if (convoTurns.length === 0) return null;
      convoTurns.reverse();

      const lines = convoTurns.map(t => `[${t.role}]: ${t.content.slice(0, 300)}`).join('\n\n');
      return `[Last session — ${lastSession.session_date} — final exchange]\n\n${lines}`;
    }

    const lines = chunks.map(c => `[${c.chunk_type}]: ${c.content.slice(0, 400)}`).join('\n\n');
    return `[Last session — ${lastSession.session_date} — ${chunks.length} key moments]\n\n${lines}`;
  } catch {
    return null;
  }
}

// ─── ASSEMBLE HOOK ────────────────────────────────────────────────────────────

/**
 * Derive agentId from sessionKey (format: "agent:<agentId>:<rest>").
 * Returns null for main/gigabrain agents (they see all unscoped data).
 * Returns explicit scope for department agents (engineering, trading, content, claims, strategy).
 */
function deriveAgentIdFromSessionKey(sessionKey?: string, explicitAgentId?: string): string | undefined {
  if (explicitAgentId) return explicitAgentId;
  if (!sessionKey) return undefined;
  const raw = sessionKey.trim().toLowerCase();
  const parts = raw.split(':').filter(Boolean);
  if (parts[0] !== 'agent') return undefined;
  const agentId = parts[1]?.trim();
  // Only scope these department agents — main/gigabrain see unscoped data
  const SCOPED_AGENTS = new Set(['engineering', 'trading', 'content', 'claims', 'strategy']);
  return (agentId && SCOPED_AGENTS.has(agentId)) ? agentId : undefined;
}

// ─── ADAPTIVE BUDGET SPLITS ───────────────────────────────────────────────────
// Strategy-aware token allocation: deep memory queries get more memory budget.
const BUDGET_SPLITS: Record<RecallStrategy, number> = {
  entity:       0.35, // 35% recent, 65% memory
  decision:     0.50, // 50/50
  verification: 0.45, // 45% recent, 55% memory
  timeline:     0.55, // 55% recent, 45% memory
  general:      0.75, // 75% recent, 25% memory (baseline)
};

async function handleAssemble(ctx: {
  messages: Array<{role: string; content: unknown}>;
  tokenBudget?: number;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}) {
  const { messages, tokenBudget = 8000, sessionId, sessionKey, agentId: explicitAgentId } = ctx;
  const db = openDatabase();

  // Derive agent scope: sessionKey is the authoritative source (OpenClaw always passes it).
  // explicitAgentId is honoured when present (e.g. direct calls / tests).
  const agentId = deriveAgentIdFromSessionKey(sessionKey, explicitAgentId);

  // Agent-scope filter: restrict all queries to this agent's chunks only.
  // This ensures Forge sees Forge's memory, GigaBrain sees GigaBrain's memory.
  const agentCondition = agentId ? `AND agent_id = ?` : '';
  const agentParams = agentId ? [agentId] : [];

  // ── RECALL STRATEGY (classifies before budgeting — strategy drives split) ─
  const strategy = classifyRecallStrategy(messages);

  // Adaptive token budget: deep memory queries get more memory allocation.
  const recentFraction = BUDGET_SPLITS[strategy] ?? 0.75;
  const recentBudget = Math.floor(tokenBudget * recentFraction);
  const memoryBudget = tokenBudget - recentBudget;

  const recentMessages = fitToTokenBudget(messages, recentBudget);

  // Detect current domain from recent turns
  const currentDomains = detectCurrentDomain(recentMessages);

  let allRetrieved: MemoryChunk[] = [];

  switch (strategy) {
    case 'entity':
      allRetrieved = retrieveEntityBrief(db, messages, memoryBudget, agentId);
      break;

    case 'timeline':
      allRetrieved = retrieveTimeline(db, messages, memoryBudget, agentId);
      break;

    case 'decision':
      allRetrieved = retrieveDecisions(db, messages, memoryBudget, currentDomains, agentId);
      break;

    case 'verification':
      allRetrieved = retrieveVerification(db, messages, memoryBudget, agentId);
      break;

    case 'general':
    default: {
      // Original domain-based retrieval — proven, keep as fallback
      const domainFilter = currentDomains.length > 0
        ? currentDomains.map(() => `json_each.value = ?`).join(' OR ')
        : null;

      const budgets = {
        decisions:    Math.floor(memoryBudget * 0.50),
        insights:     Math.floor(memoryBudget * 0.25),
        architecture: Math.floor(memoryBudget * 0.15),
        conversation: Math.floor(memoryBudget * 0.10),
      };

      const domainCondition = domainFilter
        ? `AND EXISTS (SELECT 1 FROM json_each(c.domains) WHERE ${domainFilter})`
        : '';

      // Priority 1: DECISION + CORRECTION
      let decisionChunks: MemoryChunk[] = [];
      try {
        const domainAndAgentParams = [...(domainFilter ? currentDomains : []), ...agentParams];
        const stmt = domainFilter
          ? db.prepare(`
              SELECT c.content, c.chunk_type, c.session_date, c.classification_confidence,
                     c.salience_score, c.has_relative_time
              FROM context_chunks c
              WHERE c.chunk_type IN ('DECISION', 'CORRECTION')
                AND c.source_type = 'verbatim'
                ${domainCondition}
                ${agentCondition}
              ORDER BY c.salience_score DESC, c.session_date DESC
              LIMIT 15
            `)
          : db.prepare(`
              SELECT content, chunk_type, session_date, classification_confidence,
                     salience_score, has_relative_time
              FROM context_chunks
              WHERE chunk_type IN ('DECISION', 'CORRECTION')
                AND source_type = 'verbatim'
                ${agentCondition}
              ORDER BY salience_score DESC, session_date DESC
              LIMIT 15
            `);

        decisionChunks = domainFilter
          ? stmt.all(...domainAndAgentParams) as MemoryChunk[]
          : stmt.all(...agentParams) as MemoryChunk[];
      } catch { /* table might not exist yet */ }

      // Priority 2: INSIGHT — last 7 days, high confidence
      let insightChunks: MemoryChunk[] = [];
      try {
        insightChunks = db.prepare(`
          SELECT content, chunk_type, session_date, classification_confidence,
                 salience_score, has_relative_time
          FROM context_chunks
          WHERE chunk_type = 'INSIGHT'
            AND source_type = 'verbatim'
            AND session_date >= date('now', '-7 days')
            AND classification_confidence >= 0.7
            ${agentCondition}
          ORDER BY salience_score DESC, session_date DESC
          LIMIT 8
        `).all(...agentParams) as MemoryChunk[];
      } catch { /* ignore */ }

      // Priority 3: ARCHITECTURE — current domain, last 30 days (only for systems/vlossom)
      const isArchitectureSession = currentDomains.includes('systems') || currentDomains.includes('vlossom');
      let architectureChunks: MemoryChunk[] = [];
      if (isArchitectureSession) {
        try {
          architectureChunks = db.prepare(`
            SELECT content, chunk_type, session_date, classification_confidence,
                   salience_score, has_relative_time
            FROM context_chunks
            WHERE chunk_type = 'ARCHITECTURE'
              AND source_type = 'verbatim'
              AND session_date >= date('now', '-30 days')
              ${agentCondition}
            ORDER BY session_date DESC
            LIMIT 6
          `).all(...agentParams) as MemoryChunk[];
        } catch { /* ignore */ }
      }

      // Priority 4: EMOTIONAL_SIGNAL — ONLY if spiritual/content domain active
      const isSpiritual = currentDomains.includes('spiritual') || currentDomains.includes('content');
      const isCodingOrTrading = (currentDomains.includes('systems') || currentDomains.includes('trading')) &&
        !isSpiritual;
      let emotionalChunks: MemoryChunk[] = [];
      if (isSpiritual && !isCodingOrTrading) {
        try {
          emotionalChunks = db.prepare(`
            SELECT content, chunk_type, session_date, classification_confidence
            FROM context_chunks
            WHERE chunk_type = 'EMOTIONAL_SIGNAL'
              AND source_type = 'verbatim'
              AND salience_score >= 0.9
              ${agentCondition}
            ORDER BY salience_score DESC
            LIMIT 3
          `).all(...agentParams) as MemoryChunk[];
        } catch { /* ignore */ }
      }

      allRetrieved = [
        ...fitChunksToBudget(decisionChunks, budgets.decisions),
        ...fitChunksToBudget(insightChunks, budgets.insights),
        ...fitChunksToBudget(architectureChunks, budgets.architecture),
        ...fitChunksToBudget(emotionalChunks, Math.floor(memoryBudget * 0.10)),
      ];
      break;
    }
  }

  // ── Semantic recall blend (non-blocking — falls back to BM25-only if Ollama unavailable) ──
  try {
    const lastUserMsg = messages.filter(m => m.role === 'user').at(-1);
    if (lastUserMsg) {
      const queryText = extractText(lastUserMsg.content);
      const queryEmbedding = await getQueryEmbedding(queryText);
      if (queryEmbedding) {
        const semanticHits = semanticRecall(db, queryEmbedding, agentId, 8);
        // Merge: add semantic hits not already in BM25 results (dedup by content prefix)
        const existingPrefixes = new Set(allRetrieved.map(c => c.content.slice(0, 60)));
        for (const hit of semanticHits) {
          if (!existingPrefixes.has(hit.content.slice(0, 60))) {
            allRetrieved.push(hit);
            existingPrefixes.add(hit.content.slice(0, 60));
          }
        }
        // Re-rank merged set by salience (semantic hits have already been threshold-filtered)
        allRetrieved.sort((a, b) => (b.salience_score ?? 0) - (a.salience_score ?? 0));
        // Trim to token budget
        allRetrieved = fitChunksToBudget(allRetrieved, memoryBudget);
      }
    }
  } catch {
    // Semantic recall failed — continue with BM25-only results
  }

  // ── Fresh session bootstrap ──────────────────────────────────────────────
  const isFreshSession = messages.length <= 4;
  let lastSessionBlock: {role: string; content: string} | null = null;

  if (isFreshSession) {
    const lastCtx = getLastSessionContext(db, sessionId, agentId);
    if (lastCtx) {
      lastSessionBlock = {
        role: 'system',
        content: `[Continuity — picked up from prior session]\n\n${lastCtx}`,
      };
    }
  }

  // Deduplication before injection (keeps best, removes near-dups)
  allRetrieved = dedupeChunks(allRetrieved);

  // Working memory: always-present high-value active items (prefrontal cortex)
  const workingMemory = getWorkingMemory(db, agentId);

  db.close();

  if (allRetrieved.length === 0 && !lastSessionBlock && !workingMemory) {
    return {
      messages: recentMessages,
      estimatedTokens: estimateTokens(recentMessages),
    };
  }

  // Contradiction detection across DECISION chunks
  const contradictions = detectInjectionContradictions(allRetrieved as AnnotatedChunk[]);

  const injectedBlocks: Array<{role: string; content: string}> = [];

  // 1. Working memory first (always current, high-value items)
  if (workingMemory) {
    injectedBlocks.push({ role: 'system', content: workingMemory });
  }

  // 2. Last session (continuity)
  if (lastSessionBlock) injectedBlocks.push(lastSessionBlock);

  // 3. Strategy-retrieved memory with provenance headers
  if (allRetrieved.length > 0) {
    let memContent = '';

    if (contradictions.length > 0) {
      const cLines = contradictions.map(c => {
        const winner = c.resolution === 'a_supersedes' ? c.chunkA.session_date : c.chunkB.session_date;
        return `⚠ CONTRADICTION: [DECISION — ${c.chunkA.session_date}] vs [DECISION — ${c.chunkB.session_date}]. Later decision (${winner}) likely supersedes.`;
      }).join('\n');
      memContent += `⚠ CONTRADICTION DETECTED\n${cLines}\n\n`;
    }

    const strategyNote = strategy !== 'general' ? ` (${strategy} recall)` : '';
    memContent += `[Retrieved from lossless memory — ${allRetrieved.length} chunks${strategyNote} from ${currentDomains.join(', ') || 'general'} domain(s)]\n\n`;
    memContent += (allRetrieved as AnnotatedChunk[]).map(c => annotateChunkForInjection(c)).join('\n\n');

    injectedBlocks.push({ role: 'system', content: memContent });
  }

  const finalMessages = [...injectedBlocks, ...recentMessages];

  return {
    messages: finalMessages,
    estimatedTokens: estimateTokens(finalMessages),
  };
}

// ─── PLUGIN REGISTRATION ──────────────────────────────────────────────────────

// Named export for testing — allows test scripts to call handleAssemble directly
export { handleAssemble };

export default function register(api: {
  registerContextEngine: (id: string, factory: () => unknown) => void;
  registerGatewayMethod?: (name: string, handler: (ctx: {params: Record<string, unknown>; respond: (ok: boolean, data: unknown) => void}) => void) => void;
}) {
  api.registerContextEngine('membrain', () => ({
    info: {
      id: 'membrain',
      name: 'GigaBrain MemBrain',
      ownsCompaction: true,
    },
    async ingest(ctx: Parameters<typeof handleIngest>[0]) {
      return handleIngest(ctx);
    },
    async assemble(ctx: Parameters<typeof handleAssemble>[0] & { sessionId?: string; agentId?: string }) {
      return handleAssemble(ctx);
    },
    async compact(ctx: Parameters<typeof handleCompact>[0]) {
      return handleCompact(ctx);
    },
  }));

  // Gateway method: explicit mid-session memory capture
  if (api.registerGatewayMethod) {
    api.registerGatewayMethod('memory.capture', ({ params, respond }) => {
      try {
        const content = String(params.content || '').trim();
        if (!content) { respond(false, { error: 'content is required' }); return; }

        const VALID_TYPES = new Set([
          'DECISION', 'CORRECTION', 'INSIGHT', 'ARCHITECTURE',
          'GOAL_UPDATE', 'PREFERENCE', 'CONTENT_SEED', 'EMOTIONAL_SIGNAL',
        ]);
        const rawType = String(params.type || 'INSIGHT').toUpperCase();
        const chunkType = VALID_TYPES.has(rawType) ? rawType : 'INSIGHT';

        const SALIENCE: Record<string, number> = {
          DECISION: 1.0, CORRECTION: 1.0, INSIGHT: 0.9, ARCHITECTURE: 0.85,
          GOAL_UPDATE: 0.75, PREFERENCE: 0.8, CONTENT_SEED: 0.75, EMOTIONAL_SIGNAL: 0.8,
        };

        const agentId = params.agent_id ? String(params.agent_id) : null;
        const scope = params.scope ? String(params.scope) : 'global';
        const confidence = typeof params.confidence === 'number'
          ? Math.min(1, Math.max(0, params.confidence))
          : 0.95;

        const id = randomUUID();
        const now = new Date().toISOString();
        const date = now.slice(0, 10);
        const sessionId = `explicit-${date}-${id.slice(0, 8)}`;
        const salience = SALIENCE[chunkType] ?? 0.7;

        // Tag content with [CAPTURE] prefix so reclassifier never demotes it
        const taggedContent = `[CAPTURE:${chunkType}] ${content}`;

        const db = openDatabase();
        db.prepare(`
          INSERT INTO context_chunks
            (id, session_id, agent_id, session_date, turn_index, role, chunk_type,
             content, token_estimate, salience_score, classification_confidence,
             domains, tags, source_type, has_relative_time, created_at, indexed_at)
          VALUES (?, ?, ?, ?, NULL, 'assistant', ?, ?, ?, ?, 0.95, '[]', '[]',
                  'explicit', 0, ?, ?)
        `).run(
          id, sessionId, agentId, date,
          chunkType, taggedContent,
          Math.ceil(taggedContent.length / 4),
          salience, now, now
        );
        db.close();

        respond(true, { stored: true, id, type: chunkType, salience, agent_id: agentId, scope });
      } catch (err) {
        respond(false, { error: String(err) });
      }
    });
  }

  // Gateway method: mid-session working memory refresh (Pull mode)
  // Spec: specs/memory-mid-session-refresh/SPEC.md
  if (api.registerGatewayMethod) {
    api.registerGatewayMethod('memory.refresh', async ({ params, respond }) => {
      try {
        const sessionKey  = params.session_key ? String(params.session_key) : undefined;
        const agentId     = params.agent_id    ? String(params.agent_id)    : undefined;
        const budget      = typeof params.token_budget === 'number' ? params.token_budget : 4000;
        const pushMode    = params.push === true;

        // Re-run assemble with empty recent messages (pull from DB only).
        // This surfaces any chunks captured since session start via memory.capture.
        const result = await handleAssemble({
          messages: [],
          tokenBudget: budget,
          sessionKey,
          agentId,
        });

        // handleAssemble returns { messages, estimatedTokens } where messages are
        // injected system blocks + recent messages. With messages:[] the result is
        // only the system blocks. Concatenate them into a single working memory string.
        const systemBlocks = (result.messages as Array<{role: string; content: unknown}>)
          .filter(m => m.role === 'system')
          .map(m => (typeof m.content === 'string' ? m.content : ''))
          .filter(Boolean)
          .join('\n\n---\n\n');

        // ── PUSH MODE: inject refreshed memory as a system event mid-session ──
        // When push=true, fires `openclaw system event` as a subprocess.
        // This enqueues the refreshed working memory into the active session context
        // so all subsequent turns in the same session see the updated signal.
        // Non-blocking: push failure does NOT fail the refresh call.
        let pushed = false;
        if (pushMode && systemBlocks.trim()) {
          try {
            const { execSync } = await import('node:child_process');
            const pushText = `[MEMORY REFRESH] Working memory updated:\n\n${systemBlocks.slice(0, 3000)}`;
            execSync(
              `openclaw system event --text ${JSON.stringify(pushText)} --mode now --timeout 5000`,
              { encoding: 'utf8', timeout: 8000, stdio: 'ignore' }
            );
            pushed = true;
          } catch {
            // Push failed silently — caller gets pull result regardless
            pushed = false;
          }
        }

        respond(true, {
          refreshed: true,
          pushed,
          working_memory: systemBlocks,
          agent_id: agentId ?? null,
          session_key: sessionKey ?? null,
          token_estimate: Math.ceil(systemBlocks.length / 4),
        });
      } catch (err) {
        respond(false, { error: String(err) });
      }
    });
  }

  // Gateway method for in-chat search
  if (api.registerGatewayMethod) {
    api.registerGatewayMethod('lossless.search', ({ params, respond }) => {
      try {
        const db = openDatabase();
        const query = String(params.query || '');
        const type = params.type ? String(params.type) : null;
        const domain = params.domain ? String(params.domain) : null;
        const since = params.since ? String(params.since) : null;
        const limit = Number(params.limit || 10);

        const dbParams: unknown[] = [query];
        const conditions: string[] = [];

        if (type) { conditions.push(`c.chunk_type = ?`); dbParams.push(type); }
        if (domain) { conditions.push(`EXISTS (SELECT 1 FROM json_each(c.domains) WHERE json_each.value = ?)`); dbParams.push(domain); }
        if (since) { conditions.push(`c.session_date >= ?`); dbParams.push(since); }
        dbParams.push(limit);

        const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

        const results = db.prepare(`
          SELECT c.chunk_type, c.session_date, c.domains, c.salience_score,
                 snippet(context_chunks_fts, 0, '<b>', '</b>', '...', 20) as excerpt
          FROM context_chunks_fts
          JOIN context_chunks c ON c.rowid = context_chunks_fts.rowid
          WHERE context_chunks_fts MATCH ?
            ${whereClause}
          ORDER BY rank, c.salience_score DESC
          LIMIT ?
        `).all(...dbParams);

        db.close();
        respond(true, { results });
      } catch (err) {
        respond(false, { error: String(err) });
      }
    });
  }
}

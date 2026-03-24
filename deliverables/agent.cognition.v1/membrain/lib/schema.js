/**
 * schema.js — DB schema + migration for @legogigabrain/memory
 * Uses node:sqlite (Node 22+, experimental — pass --experimental-sqlite)
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDbPath } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Open (or create) the SQLite database and run migrations.
 * @param {string} [dbPath] - Optional path override (for tests)
 * @returns {DatabaseSync} db instance
 */
export function openDatabase(dbPath = getDbPath()) {
  const db = new DatabaseSync(dbPath);

  // Enable WAL for better concurrent access
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  runMigrations(db);
  return db;
}

function runMigrations(db) {
  // ─── CORE TABLES (must come first — world model migrations depend on these) ──

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL DEFAULT 0.65,
      source_session TEXT,
      source_agent TEXT DEFAULT 'main',
      scope TEXT DEFAULT 'global',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      merged_into TEXT,
      tags TEXT DEFAULT '[]'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_current (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL DEFAULT 0.65,
      scope TEXT DEFAULT 'global',
      source_agent TEXT DEFAULT 'main',
      value_score REAL DEFAULT 0.5,
      mention_count INTEGER DEFAULT 0,
      last_recalled TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tags TEXT DEFAULT '[]'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      mention_count INTEGER DEFAULT 1,
      related_ids TEXT DEFAULT '[]'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_maintenance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at TEXT NOT NULL,
      actions_taken TEXT NOT NULL,
      memories_archived INTEGER DEFAULT 0,
      memories_merged INTEGER DEFAULT 0,
      memories_rejected INTEGER DEFAULT 0,
      duration_ms INTEGER
    );
  `);

  // Useful indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_current_scope ON memory_current(scope);
    CREATE INDEX IF NOT EXISTS idx_memory_current_type ON memory_current(type);
    CREATE INDEX IF NOT EXISTS idx_memory_current_value ON memory_current(value_score DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_events_status ON memory_events(status);
  `);

  // context_chunks (Layer 1 — created here for test DB compatibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      agent_id TEXT,
      topic_id TEXT,
      session_date TEXT,
      turn_index INTEGER,
      role TEXT,
      chunk_type TEXT NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER DEFAULT 0,
      salience_score REAL DEFAULT 0.5,
      classification_confidence REAL DEFAULT 0.8,
      domains TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      source_file TEXT,
      source_type TEXT,
      compacted INTEGER DEFAULT 0,
      created_at TEXT,
      indexed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_type ON context_chunks(chunk_type);
    CREATE INDEX IF NOT EXISTS idx_chunks_date ON context_chunks(session_date);
    CREATE INDEX IF NOT EXISTS idx_chunks_salience ON context_chunks(salience_score DESC);
  `);

  // ─── WORLD MODEL MIGRATIONS (Phase 1) ────────────────────────────────────
  // Idempotent — safe to run multiple times. Runs after core tables exist.

  // Extend memory_entities with world model columns
  const entityCols = db.prepare('PRAGMA table_info(memory_entities)').all().map(c => c.name);
  const entityAlters = [
    ['canonical', 'TEXT'],
    ['last_seen', 'TEXT'],
    ['domains', "TEXT DEFAULT '[]'"],
    ['summary', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['source_agent', "TEXT DEFAULT 'gigabrain'"],
  ];
  for (const [col, type] of entityAlters) {
    if (!entityCols.includes(col)) {
      db.exec(`ALTER TABLE memory_entities ADD COLUMN ${col} ${type};`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_candidates (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      canonical     TEXT NOT NULL,
      mention_count INTEGER DEFAULT 1,
      first_seen    TEXT,
      last_seen     TEXT,
      domains       TEXT DEFAULT '[]',
      sample_context TEXT,
      source_agent  TEXT DEFAULT 'gigabrain',
      created_at    TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entity_aliases (
      id        TEXT PRIMARY KEY,
      entity_id TEXT REFERENCES memory_entities(id),
      alias     TEXT NOT NULL,
      canonical TEXT NOT NULL,
      source_agent TEXT DEFAULT 'gigabrain'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_beliefs (
      id              TEXT PRIMARY KEY,
      entity_id       TEXT REFERENCES memory_entities(id),
      belief_text     TEXT NOT NULL,
      confidence      REAL DEFAULT 0.7,
      relevance_decay REAL DEFAULT 1.0,
      source_chunk_id TEXT,
      session_date    TEXT,
      superseded_by   TEXT,
      source_agent    TEXT DEFAULT 'gigabrain',
      created_at      TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_episodes (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      summary         TEXT,
      session_date    TEXT,
      entity_ids      TEXT DEFAULT '[]',
      chunk_type      TEXT,
      source_chunk_id TEXT,
      salience        REAL DEFAULT 0.7,
      source_agent    TEXT DEFAULT 'gigabrain',
      created_at      TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_open_loops (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      description      TEXT,
      entity_id        TEXT,
      opened_date      TEXT,
      last_seen        TEXT,
      status           TEXT DEFAULT 'open',
      resolution_notes TEXT,
      source_chunk_id  TEXT,
      source_agent     TEXT DEFAULT 'gigabrain',
      created_at       TEXT,
      updated_at       TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS belief_contradictions (
      id           TEXT PRIMARY KEY,
      belief_a     TEXT REFERENCES memory_beliefs(id),
      belief_b     TEXT REFERENCES memory_beliefs(id),
      entity_id    TEXT REFERENCES memory_entities(id),
      detected_at  TEXT,
      resolution   TEXT,
      notes        TEXT,
      source_agent TEXT DEFAULT 'gigabrain'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_runs (
      id           TEXT PRIMARY KEY,
      run_date     TEXT,
      source_agent TEXT,
      high_water_chunk_rowid INTEGER,
      entities_created  INTEGER DEFAULT 0,
      beliefs_created   INTEGER DEFAULT 0,
      episodes_created  INTEGER DEFAULT 0,
      loops_created     INTEGER DEFAULT 0,
      loops_resolved    INTEGER DEFAULT 0,
      contradictions_found INTEGER DEFAULT 0,
      status       TEXT DEFAULT 'complete',
      started_at   TEXT,
      completed_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_handoffs (
      id               TEXT PRIMARY KEY,
      agent            TEXT NOT NULL,
      session_key      TEXT,
      trigger          TEXT,
      handoff_at       TEXT,
      summary          TEXT,
      decisions_made   TEXT DEFAULT '[]',
      open_items       TEXT DEFAULT '[]',
      next_actions     TEXT DEFAULT '[]',
      context_snapshot TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_handoffs_agent ON session_handoffs(agent);
  `);

  // ─── V2 MIGRATIONS (idempotent — safe to re-run) ─────────────────────────

  // Extend context_chunks with confidence decay + relative-time fields
  const chunkCols = db.prepare('PRAGMA table_info(context_chunks)').all().map(c => c.name);
  const chunkAlters = [
    ['has_relative_time', 'INTEGER DEFAULT 0'],
    ['last_confirmed_at', 'TEXT'],
    ['confirmation_count', 'INTEGER DEFAULT 0'],
    ['effective_salience', 'REAL'],
    ['embedding', 'BLOB'],
  ];
  for (const [col, type] of chunkAlters) {
    if (!chunkCols.includes(col)) {
      try {
        db.exec(`ALTER TABLE context_chunks ADD COLUMN ${col} ${type};`);
      } catch { /* already exists */ }
    }
  }

  // Add status column to memory_current (required for working memory filter)
  const currentCols = db.prepare('PRAGMA table_info(memory_current)').all().map(c => c.name);
  if (!currentCols.includes('status')) {
    try {
      db.exec(`ALTER TABLE memory_current ADD COLUMN status TEXT DEFAULT 'active';`);
    } catch { /* already exists */ }
  }

  // Cross-session pattern synthesis table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      description TEXT NOT NULL,
      source_chunk_ids TEXT NOT NULL,
      agent_id TEXT,
      domain TEXT,
      first_observed TEXT NOT NULL,
      last_observed TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.7,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_type ON memory_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_patterns_domain ON memory_patterns(domain);
    CREATE INDEX IF NOT EXISTS idx_patterns_agent ON memory_patterns(agent_id);
  `);

  // Eval harness results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      run_date TEXT NOT NULL,
      case_id TEXT NOT NULL,
      strategy TEXT,
      agent_id TEXT,
      precision_at_5 REAL,
      mrr REAL,
      hit_at_5 INTEGER,
      latency_ms INTEGER,
      top_chunk_types TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_eval_runs_date ON eval_runs(run_date);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_case ON eval_runs(case_id);
  `);

  // World model indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_beliefs_entity ON memory_beliefs(entity_id);
    CREATE INDEX IF NOT EXISTS idx_beliefs_decay ON memory_beliefs(relevance_decay);
    CREATE INDEX IF NOT EXISTS idx_beliefs_superseded ON memory_beliefs(superseded_by);
    CREATE INDEX IF NOT EXISTS idx_episodes_entity ON memory_episodes(entity_ids);
    CREATE INDEX IF NOT EXISTS idx_episodes_date ON memory_episodes(session_date);
    CREATE INDEX IF NOT EXISTS idx_loops_status ON memory_open_loops(status);
    CREATE INDEX IF NOT EXISTS idx_loops_date ON memory_open_loops(last_seen);
    CREATE INDEX IF NOT EXISTS idx_candidates_canonical ON entity_candidates(canonical);
    CREATE INDEX IF NOT EXISTS idx_proj_runs_date ON projection_runs(run_date);
  `);
}

export const TYPE_WEIGHTS = {
  DECISION:       1.0,
  CORRECTION:     1.0,
  CLIENT_SIGNAL:  0.9,
  INSIGHT:        0.85,
  PREFERENCE:     0.8,
  USER_FACT:      0.75,
  ENTITY:         0.6,
  EPISODE:        0.4,
};

export const VALID_TYPES = Object.keys(TYPE_WEIGHTS);

export const NEVER_AUTO_ARCHIVE = new Set(['DECISION', 'CORRECTION', 'PREFERENCE', 'CLIENT_SIGNAL']);

export function computeInitialValueScore(type, confidence) {
  const typeWeight = TYPE_WEIGHTS[type] ?? 0.5;
  const recencyBonus = 1.0;
  return (typeWeight * 0.4) + (confidence * 0.4) + (recencyBonus * 0.2);
}

export function computeDecayedValueScore(type, confidence, createdAt, mentionCount) {
  const typeWeight = TYPE_WEIGHTS[type] ?? 0.5;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - ageDays / 180);
  const recallBonus = Math.min(1, mentionCount / 10);
  return (typeWeight * 0.4) + (confidence * 0.4) + (recency * 0.1) + (recallBonus * 0.1);
}

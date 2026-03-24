/**
 * config.js — Portable workspace configuration for @legogigabrain/memory
 *
 * Priority order for workspace root:
 * 1. OPENCLAW_WORKSPACE env var
 * 2. GIGABRAIN_WORKSPACE env var (backwards compat)
 * 3. registry.config.json in this lib folder (written by setup.js)
 * 4. Auto-detect: walk up from __dirname until MEMORY.md or AGENTS.md is found
 * 5. Fallback: os.homedir() + "/.openclaw/workspace"
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'registry.config.json');

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function readConfigFile() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function autoDetectWorkspace() {
  // Walk up from lib/ until we find MEMORY.md or AGENTS.md
  let dir = __dirname;
  for (let i = 0; i < 15; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break; // Hit filesystem root
    dir = parent;
    if (existsSync(path.join(dir, 'MEMORY.md')) || existsSync(path.join(dir, 'AGENTS.md'))) {
      return dir;
    }
  }
  return null;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Get the workspace root, using the priority chain.
 * @returns {string} absolute path to workspace root
 */
export function getWorkspaceRoot() {
  // 1. OpenClaw env var (primary)
  if (process.env.OPENCLAW_WORKSPACE) {
    return path.resolve(process.env.OPENCLAW_WORKSPACE);
  }
  // 2. GigaBrain env var (backwards compat)
  if (process.env.GIGABRAIN_WORKSPACE) {
    return path.resolve(process.env.GIGABRAIN_WORKSPACE);
  }
  // 3. Config file written by setup.js
  const cfg = readConfigFile();
  if (cfg?.workspaceRoot) {
    return path.resolve(cfg.workspaceRoot);
  }
  // 4. Auto-detect: walk up looking for workspace markers
  const detected = autoDetectWorkspace();
  if (detected) return detected;
  // 5. Fallback: conventional OpenClaw install location
  return path.join(os.homedir(), '.openclaw', 'workspace');
}

/**
 * Path to the SQLite database.
 * Respects GIGABRAIN_DB env var for backwards compatibility with existing crons/tests.
 * @returns {string}
 */
export function getDbPath() {
  if (process.env.GIGABRAIN_DB) return process.env.GIGABRAIN_DB;
  return path.join(getWorkspaceRoot(), 'systems/memory-architecture/registry/gigabrain.db');
}

/**
 * Directory for nightly DB snapshots.
 * @returns {string}
 */
export function getSnapshotDir() {
  return path.join(getWorkspaceRoot(), 'systems/memory-architecture/snapshots');
}

/**
 * Path to the auto-generated registry context markdown file.
 * @returns {string}
 */
export function getRegistryContextPath() {
  return path.join(getWorkspaceRoot(), 'memory/state/registry-context.md');
}

/**
 * Path to the Blaen sync log.
 * @returns {string}
 */
export function getBlaenSyncLogPath() {
  return path.join(getWorkspaceRoot(), 'memory/state/blaen-sync-log.md');
}

/**
 * Path to the deduplication review queue.
 * @returns {string}
 */
export function getDedupeQueuePath() {
  return path.join(getWorkspaceRoot(), 'memory/state/dedupe-review-queue.md');
}

/**
 * Get the Blaen workspace root (separate agent install).
 * Returns null if not configured.
 * @returns {string|null}
 */
export function getBlaenWorkspaceRoot() {
  if (process.env.GIGABRAIN_BLAEN_WORKSPACE) {
    return path.resolve(process.env.GIGABRAIN_BLAEN_WORKSPACE);
  }
  const cfg = readConfigFile();
  if (cfg?.blaenWorkspaceRoot) {
    return path.resolve(cfg.blaenWorkspaceRoot);
  }
  const defaultBlaen = path.join(os.homedir(), '.openclaw-blaen', 'workspace');
  if (existsSync(defaultBlaen)) return defaultBlaen;
  return null;
}

/**
 * Load the full config object from registry.config.json.
 * Returns defaults if the file doesn't exist.
 * @returns {object}
 */
export function loadConfig() {
  const defaults = {
    workspaceRoot: getWorkspaceRoot(),
    blaenWorkspaceRoot: getBlaenWorkspaceRoot(),
    brandScopes: [],
  };
  const cfg = readConfigFile();
  if (!cfg) return defaults;
  return {
    workspaceRoot: cfg.workspaceRoot || defaults.workspaceRoot,
    blaenWorkspaceRoot: cfg.blaenWorkspaceRoot || defaults.blaenWorkspaceRoot,
    brandScopes: cfg.brandScopes || defaults.brandScopes,
  };
}

/**
 * Write config to registry.config.json (in lib/ folder).
 * @param {object} cfg
 */
export function saveConfig(cfg) {
  const toWrite = {
    workspaceRoot: cfg.workspaceRoot,
    blaenWorkspaceRoot: cfg.blaenWorkspaceRoot || null,
    brandScopes: cfg.brandScopes || [],
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(toWrite, null, 2) + '\n', 'utf8');
}

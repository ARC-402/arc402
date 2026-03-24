#!/usr/bin/env bash
# agent.cognition.v1 — install script
# Usage: bash install.sh [--workspace PATH]
# Auto-detects workspace if not specified.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
WORKSPACE=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash install.sh [--workspace PATH]" >&2
      exit 1
      ;;
  esac
done

# Auto-detect workspace if not specified
if [[ -z "$WORKSPACE" ]]; then
  if [[ -f "$OPENCLAW_CONFIG" ]]; then
    WORKSPACE="$(node -e "const c=JSON.parse(require('fs').readFileSync('$OPENCLAW_CONFIG','utf8')); console.log(c.workspace || c.workspacePath || '')" 2>/dev/null || true)"
  fi
  if [[ -z "$WORKSPACE" ]]; then
    echo "Error: Could not auto-detect workspace. Pass --workspace PATH" >&2
    exit 1
  fi
fi

echo "Installing agent.cognition.v1 to workspace: $WORKSPACE"
echo ""

EXTENSIONS_DIR="$HOME/.openclaw/extensions"
mkdir -p "$EXTENSIONS_DIR"

# ── 1. Install MemBrain ──────────────────────────────────────────────────────

echo "Installing MemBrain v2..."

rsync -a --exclude='node_modules/' --exclude='.git/' \
  "$SCRIPT_DIR/membrain/" "$EXTENSIONS_DIR/membrain/"

(cd "$EXTENSIONS_DIR/membrain" && npm install --production --silent)

# Patch openclaw.json to add membrain plugin entry (idempotent)
if [[ -f "$OPENCLAW_CONFIG" ]]; then
  OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG" \
  MEMBRAIN_PATH="$EXTENSIONS_DIR/membrain" \
  node - <<'EOF'
const fs = require('fs');
const cfgPath = process.env.OPENCLAW_CONFIG_PATH;
const raw = fs.readFileSync(cfgPath, 'utf8');
const config = JSON.parse(raw);

if (!config.plugins) config.plugins = [];

const alreadyRegistered = config.plugins.some(p =>
  (typeof p === 'string' && p.includes('membrain')) ||
  (typeof p === 'object' && (p.id === 'membrain' || (p.path || '').includes('membrain')))
);

if (!alreadyRegistered) {
  config.plugins.push({ id: 'membrain', path: process.env.MEMBRAIN_PATH });
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
  console.log('  Patched openclaw.json with membrain plugin entry.');
} else {
  console.log('  membrain already registered in openclaw.json (skipped).');
}
EOF
fi

(cd "$EXTENSIONS_DIR/membrain" && OPENCLAW_WORKSPACE="$WORKSPACE" node scripts/setup.js 2>/dev/null || true)

# ── 2. Install NervousSystem ─────────────────────────────────────────────────

echo "Installing NervousSystem..."

rsync -a --exclude='node_modules/' --exclude='.git/' \
  "$SCRIPT_DIR/nervous-system/" "$EXTENSIONS_DIR/nervous-system/"

if [[ -f "$EXTENSIONS_DIR/nervous-system/package.json" ]]; then
  (cd "$EXTENSIONS_DIR/nervous-system" && npm install --production --silent)
fi

(cd "$EXTENSIONS_DIR/nervous-system" && OPENCLAW_WORKSPACE="$WORKSPACE" node scripts/setup.js 2>/dev/null || true)

# ── 3. Install ImmuneSystem ──────────────────────────────────────────────────

echo "Installing ImmuneSystem..."

rsync -a --exclude='node_modules/' --exclude='.git/' \
  "$SCRIPT_DIR/immune-system/" "$EXTENSIONS_DIR/immune-system/"

if [[ -f "$EXTENSIONS_DIR/immune-system/package.json" ]]; then
  (cd "$EXTENSIONS_DIR/immune-system" && npm install --production --silent)
fi

if [[ -f "$EXTENSIONS_DIR/immune-system/scripts/setup.js" ]]; then
  (cd "$EXTENSIONS_DIR/immune-system" && OPENCLAW_WORKSPACE="$WORKSPACE" node scripts/setup.js 2>/dev/null || true)
fi

# ── 4. Install Signatures ────────────────────────────────────────────────────

echo "Installing Signatures..."

rsync -a --exclude='node_modules/' --exclude='.git/' \
  "$SCRIPT_DIR/signatures/" "$EXTENSIONS_DIR/signatures/"

echo "  Signatures available. Run: arc402 agent.cognition signature install <name>"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "✓ MemBrain installed (lossless memory, BM25 + semantic recall)"
echo "✓ NervousSystem installed (self-improvement loop)"
echo "✓ ImmuneSystem installed (preflight gates)"
echo "✓ Signatures ready (7 cognitive patterns available)"
echo ""
echo "One step remaining:"
echo "  openclaw gateway restart"
echo ""
echo "After restart, your agent is running agent.cognition.v1."

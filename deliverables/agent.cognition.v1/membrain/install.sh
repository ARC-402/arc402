#!/usr/bin/env bash
# @legogigabrain/memory — one-command installer
#
# Usage:
#   bash install.sh
#   bash install.sh --workspace /path/to/workspace
#   bash install.sh --profile blaen
#   bash install.sh --yes
#
# TODO: When published to npm, replace the copy step with:
#   npm install -g @legogigabrain/memory
#   and point to the global install path.

set -euo pipefail

EXTENSION_DIR="$HOME/.openclaw/extensions/lossless-memory"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── COLOURS ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; }
heading() { echo -e "\n$*\n$( printf '%.0s━' $(seq 1 50) )\n"; }

# ─── CHECKS ───────────────────────────────────────────────────────────────────

heading "@legogigabrain/memory — Installer"

# Check Node.js >= 22
if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  echo "  Install from: https://nodejs.org (version 22 or higher required)"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  error "Node.js >= 22 required (found v$NODE_VERSION)"
  echo "  Install from: https://nodejs.org"
  exit 1
fi
info "Node.js $(node --version)"

# Check OpenClaw (warn but don't fail — user might be installing without gateway)
if command -v openclaw &>/dev/null; then
  info "OpenClaw $(openclaw --version 2>/dev/null || echo 'detected')"
else
  warn "openclaw CLI not found in PATH. You can still use memoryctl directly."
fi

# ─── INSTALL ──────────────────────────────────────────────────────────────────

# Determine source location
# TODO: When published to npm, replace this with:
#   npm install -g @legogigabrain/memory
#   EXTENSION_DIR="$(npm root -g)/@legogigabrain/memory"
SOURCE_DIR="$SCRIPT_DIR"

if [ "$SOURCE_DIR" != "$EXTENSION_DIR" ]; then
  echo "Installing from: $SOURCE_DIR"
  echo "Installing to:   $EXTENSION_DIR"
  echo ""

  # Create destination
  mkdir -p "$(dirname "$EXTENSION_DIR")"

  if [ -d "$EXTENSION_DIR" ]; then
    warn "Extension already exists at $EXTENSION_DIR"
    echo "  Updating in-place (preserving registry.config.json if present)"
    # Preserve existing registry.config.json
    TEMP_CONFIG=""
    if [ -f "$EXTENSION_DIR/lib/registry.config.json" ]; then
      TEMP_CONFIG="$(cat "$EXTENSION_DIR/lib/registry.config.json")"
    fi
    # Copy files (exclude node_modules and the db itself)
    rsync -a --exclude='node_modules/' --exclude='*.db' --exclude='registry.config.json' \
      "$SOURCE_DIR/" "$EXTENSION_DIR/"
    # Restore config if it existed
    if [ -n "$TEMP_CONFIG" ]; then
      echo "$TEMP_CONFIG" > "$EXTENSION_DIR/lib/registry.config.json"
      info "Preserved registry.config.json"
    fi
  else
    # Fresh install — copy everything except node_modules and db
    rsync -a --exclude='node_modules/' --exclude='*.db' \
      "$SOURCE_DIR/" "$EXTENSION_DIR/"
    info "Copied extension to $EXTENSION_DIR"
  fi
else
  info "Running from install location — no copy needed"
fi

# Make scripts executable
chmod +x "$EXTENSION_DIR/scripts/setup.js" 2>/dev/null || true
chmod +x "$EXTENSION_DIR/scripts/memoryctl.js" 2>/dev/null || true

# ─── SETUP ────────────────────────────────────────────────────────────────────

echo ""
echo "Running setup..."
echo ""

cd "$EXTENSION_DIR"
node scripts/setup.js "$@"

# ─── DONE ─────────────────────────────────────────────────────────────────────

echo ""
info "Installation complete"
echo ""
echo "Run a health check:"
echo "  node $EXTENSION_DIR/scripts/memoryctl.js doctor"
echo ""
echo "Or if memoryctl is in your PATH:"
echo "  memoryctl doctor"
echo ""

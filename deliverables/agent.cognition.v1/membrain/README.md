# @legogigabrain/memory

Lossless memory stack for OpenClaw agents. Built for multi-agent environments.

## What it does

- **Lossless ingestion** — every conversation turn stored and classified
- **BM25 recall** — relevance-ranked retrieval with recency decay
- **Agent scoping** — department agents see only their own memory
- **Pattern synthesis** — detects recurring patterns across sessions
- **Contradiction detection** — flags conflicting decisions at retrieval time
- **Eval harness** — measures recall quality nightly

## Install

### OpenClaw (recommended)

```bash
openclaw plugins install @legogigabrain/memory
cd ~/.openclaw/extensions/lossless-memory
node scripts/setup.js
```

### Manual / curl

```bash
curl -fsSL https://raw.githubusercontent.com/legogigabrain/memory/main/install.sh | bash
```

### From source

```bash
git clone https://github.com/legogigabrain/memory ~/.openclaw/extensions/lossless-memory
cd ~/.openclaw/extensions/lossless-memory
node scripts/setup.js --workspace /path/to/your/workspace
```

## After install

Restart your OpenClaw gateway:

```
openclaw gateway restart
```

## Commands

```
memoryctl doctor      # Health check
memoryctl stats       # Chunk counts by agent
memoryctl eval        # Run recall quality eval
memoryctl nightly     # Run maintenance pipeline
memoryctl patterns    # Detect cross-session patterns
memoryctl workspace   # Update workspace path
```

## Requirements

- Node.js >= 22
- OpenClaw >= 2026.2.15

## Configuration

The plugin auto-detects your OpenClaw workspace using this priority chain:

1. `OPENCLAW_WORKSPACE` environment variable
2. `GIGABRAIN_WORKSPACE` environment variable (backwards compat)
3. `lib/registry.config.json` (written by `setup.js`)
4. Auto-detect: walks up directory tree looking for `MEMORY.md` or `AGENTS.md`
5. Fallback: `~/.openclaw/workspace`

Override at runtime:

```bash
GIGABRAIN_WORKSPACE=/path/to/workspace openclaw gateway restart
```

## Multi-agent setup

Memory is automatically scoped by agent ID. The plugin derives agent identity from the OpenClaw `sessionKey` format (`agent:<agentId>:<rest>`).

Supported scoped agents: `engineering`, `trading`, `content`, `claims`, `strategy`, `design`, `research`, `client-ops`

Main/GigaBrain agents see all unscoped data.

## DB location

```
<workspace>/systems/memory-architecture/registry/gigabrain.db
```

Snapshots written to:

```
<workspace>/systems/memory-architecture/snapshots/
```

## Multi-harness setup

The memory system works across OpenClaw, Claude Code, Codex, and Claude Desktop via MCP.

### Claude Code

```bash
node scripts/setup.js --harness claude-code --project-root /path/to/project
# Creates .mcp.json in project root
```

### Codex

```bash
node scripts/setup.js --harness codex
# Writes to ~/.codex/config
```

### Claude Desktop

```bash
node scripts/setup.js --harness claude-desktop
# Patches ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)
# or ~/.config/Claude/claude_desktop_config.json (Linux)
```

### All harnesses at once

```bash
node scripts/setup.js --harness all --workspace /path/to/workspace
```

### Start the MCP server manually

```bash
node mcp-server.js
# or
npx gigabrain-mcp
```

### Available MCP tools

| Tool | Description |
|------|-------------|
| `gigabrain_recall` | Retrieve relevant memory chunks for a query |
| `gigabrain_remember` | Store a durable memory |
| `gigabrain_checkpoint` | Save a session checkpoint |
| `gigabrain_entity` | Get everything known about an entity |
| `gigabrain_contradictions` | List unresolved contradictions |
| `gigabrain_patterns` | Get detected cross-session patterns |
| `gigabrain_stats` | Memory system health and statistics |
| `gigabrain_workspace` | Get or set the workspace path |

## Architecture

```
Layer 0: session_turns (raw lossless index — never discarded)
Layer 1: context_chunks (classified + salience-scored)
World model: entities, beliefs, episodes, contradictions
```

Retrieval routes queries to specialised strategies:

| Strategy | Triggers |
|----------|----------|
| `entity` | "who is...", "tell me about..." |
| `timeline` | "what happened...", "when did..." |
| `decision` | "did we decide...", "what's the plan..." |
| `verification` | "didn't I say...", contradictions |
| `general` | fallback (domain-based) |

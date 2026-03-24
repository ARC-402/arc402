# @legogigabrain/immune-system

Protection layer for AI agents. Preflight gates, destructive operation blocking, and context-before-creation enforcement.

**Protection enables freedom.** The immune system doesn't restrict the organism — it gives it the safety to explore, experiment, and evolve without catastrophic failure.

## What It Does

The immune system intercepts agent operations before execution and validates them against a set of configurable rules. It enforces two classes of protection:

- **IDENTITY rules** — core agent identity and values. Never bypass.
- **OPERATIONAL rules** — workflow quality gates. Can be overridden with intent.

## Active Rules (Default)

| Rule | Severity | Gate |
|------|----------|------|
| `context-before-creation` | OPERATIONAL | Must read relevant existing files first |
| `trash-over-rm` | OPERATIONAL | Prefer trash command or confirm permanent delete |
| `discuss-before-building` | OPERATIONAL | Surface plan before executing |
| `memory-before-speaking` | OPERATIONAL | Search memory before asserting |
| `scan-before-building` | OPERATIONAL | Search workspace before building |
| `deep-read-on-modify` | OPERATIONAL | Full file read required before critical system edits |
| `no-exfiltration` | IDENTITY | Confirm scope before sending data outside the machine |
| `soul-protection` | IDENTITY | Explicit user instruction required to modify SOUL.md/USER.md/AGENTS.md |

## Install

```bash
npm install @legogigabrain/immune-system
# or link locally:
npm link
```

## Setup

```bash
node scripts/setup.js
```

This will:
1. Detect your OpenClaw workspace
2. Write `immune-system.config.json` to the workspace root with default rule settings
3. Print all active rules and how to customize them

## CLI Usage

```bash
# Run preflight check on workspace or a specific path
immunectl check
immunectl check /path/to/dir

# View active rules and status
immunectl status

# List all rules with descriptions
immunectl rules

# Simulate triggering a gate
immunectl test-gate context-before-creation

# Toggle rules
immunectl enable soul-protection
immunectl disable discuss-before-building

# Output system prompt injection block (pipe to agent context)
immunectl inject
```

## System Prompt Injection

The immune system generates a compact block (under 400 chars) for injection into agent system prompts:

```javascript
import { getActiveRules } from "@legogigabrain/immune-system/core/rules.js";
import { generateImmuneSystemPrompt } from "@legogigabrain/immune-system/core/system-prompt-injection.js";

const prompt = generateImmuneSystemPrompt(getActiveRules());
// Prepend `prompt` to your agent's system message
```

Or via CLI for hook-based injection:
```bash
immunectl inject
```

## Custom Rules

Add rules to `immune-system.config.json` in your workspace root, or extend `IMMUNE_RULES` in `core/rules.js`:

```json
{
  "rules": {
    "context-before-creation": { "enabled": true },
    "discuss-before-building": { "enabled": false }
  }
}
```

Each rule object shape:
```javascript
{
  id: "my-rule",
  severity: "OPERATIONAL",           // or "IDENTITY"
  description: "What this prevents",
  triggers: ["keyword", "pattern"],   // string fragments that activate this rule
  gate: "What must happen before proceeding",
  violation_response: "BLOCK | WARN | SUBSTITUTE + action",
  enabled: true
}
```

## Preflight Check

The preflight check validates workspace state before major operations:

- Core files present and non-empty (AGENTS.md, MEMORY.md, SOUL.md)
- MEMORY.md size within limits (warns at 10KB, fails at 15KB)
- Target path exists and is accessible
- Immune rules loaded successfully

Exit codes: `0` = all clear, `1` = issues found.

## Rate Limits (Reference)

The immune system documents these operational limits in config:

| Category | Limit |
|----------|-------|
| File writes | 100/min |
| File deletes | 20/min |
| Network requests | 60/min |
| External requests | 20/min |
| Messages sent | 30/min |
| Broadcasts | 5/min |
| Shell executions | 50/min |
| Sudo operations | 5/min |
| Evolution changes | 3 per 5-min window |

## Philosophy

> Standards are crystallized wisdom, not arbitrary rules. Every gate exists because violating it caused actual problems.

- `context-before-creation` exists because building without reading context produces wrong work.
- `soul-protection` exists because identity drift is irreversible.
- `no-exfiltration` exists because data leaves machines permanently.

Trust is earned incrementally. The immune system starts with maximum oversight and reduces friction as patterns prove reliable.

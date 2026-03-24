# @legogigabrain/nervous-system

Self-improving agent system. Daily evolution tick, correction pipeline, neurogenesis, synaptic pruning.

## What it does

The nervous system runs a nightly tick at 23:30 local time. Each tick:

1. Reads the last 3 daily memory files (`memory/YYYY-MM-DD.md`) from your workspace
2. Extracts corrections, insights, and goal items — scored by salience
3. Detects repeated corrections (same mistake 2+ times → written to MEMORY.md; 3+ times → structural rule file created)
4. Writes a timestamped entry to `memory/evolution-log.md`
5. Outputs a summary to stdout / the tick log

Over time the system accumulates a corpus of what has gone wrong, what has been learned, and what structural fixes have been auto-generated.

## Install

```bash
npm install -g @legogigabrain/nervous-system
# or from a local clone:
npm install
```

Then run setup once to register the nightly job:

```bash
nervousctl install-cron
# or: npm run setup
```

Set the `GIGABRAIN_WORKSPACE` environment variable if your workspace is not at `~/.openclaw/workspace`:

```bash
export GIGABRAIN_WORKSPACE=/path/to/your/workspace
nervousctl install-cron
```

## Commands

| Command | Description |
|---|---|
| `nervousctl tick` | Run one evolution cycle immediately |
| `nervousctl force-tick` | Alias for `tick` |
| `nervousctl status` | Show last tick time, counters, next scheduled run |
| `nervousctl view-log` | Print the full evolution log |
| `nervousctl view-log --days 7` | Print the last 7 days of the log |
| `nervousctl install-cron` | (Re)install the nightly cron/launchd job |
| `nervousctl uninstall-cron` | Remove the scheduled job |

All commands accept `--workspace /path/to/workspace` to override auto-detection.

## Workspace detection

The workspace is resolved in this order:

1. `GIGABRAIN_WORKSPACE` environment variable
2. `--workspace <path>` CLI argument
3. Walk up from `cwd` looking for a directory containing both `MEMORY.md` and `AGENTS.md`
4. `~/.openclaw/workspace` (default openclaw location)

## How to verify it ran

```bash
# Quick status check
nervousctl status

# See what the last tick did
nervousctl view-log --days 1

# Full log
nervousctl view-log
```

The tick also appends to `memory/evolution-tick.log` (stdout from the cron job).

## How to read the evolution log

`memory/evolution-log.md` has one `## YYYY-MM-DD` section per tick. Each section records:

- Which memory files were scanned
- How many corrections / insights / goal items were found
- Whether anything was written to `MEMORY.md`
- Whether any structural rule files were auto-generated (neurogenesis)
- Any actions taken (with `NEUROGENESIS:` or `MEMORY UPDATE:` prefixes)

Auto-generated rule files appear in `skills/auto-rule-*.md`. Review them, codify the fix in the relevant skill or AGENTS.md, then delete the file.

## Salience scores

| Finding type | Salience | Threshold for MEMORY.md write | Threshold for rule file |
|---|---|---|---|
| Correction | 1.0 | 2 occurrences | 3 occurrences |
| Insight | 0.9 | — | — |
| Goal item | 0.75 | — | — |

## Platform support

- **Linux**: installs a user crontab entry (`crontab -l` / `crontab -`)
- **macOS**: installs a launchd plist at `~/Library/LaunchAgents/com.legogigabrain.nervous-system.plist`

## Requirements

- Node.js ≥ 22.0.0
- No external npm dependencies (pure Node.js ESM)

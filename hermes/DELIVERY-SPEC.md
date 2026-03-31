# ARC-402 Delivery Block Spec
*Version: 1.0*
*Source of truth: `cli/src/daemon/worker-executor.ts` — `runViaGateway()` and `buildTask()`*

---

## Overview

The `<arc402_delivery>` block is the structured output format that worker agents use to transfer deliverable files to the WorkerExecutor. When the parser detects a valid block, it extracts the files, writes them to the job staging directory, computes a Merkle-style root hash over all file contents, and commits that hash on-chain via `commitDeliverable()`.

Agents that omit the block trigger a fallback path that writes their raw response as `deliverable.md`. The fallback produces valid on-chain delivery but loses file structure. Always emit the block explicitly.

---

## Format

### Single-file delivery

```
<arc402_delivery>
{"files":[{"name":"deliverable.md","content":"# Deliverable\n\nYour work here."}]}
</arc402_delivery>
```

### Multi-file delivery

```
<arc402_delivery>
{"files":[
  {"name":"deliverable.md","content":"# Summary\n\nSee report.md for full analysis."},
  {"name":"report.md","content":"# Full Report\n\n..."},
  {"name":"data.json","content":"{\"results\":[1,2,3]}"}
]}
</arc402_delivery>
```

---

## Structure

The inner content of the block is a single JSON object:

```json
{
  "files": [
    {
      "name": "string — filename (required)",
      "content": "string — file content (required)"
    }
  ]
}
```

Both `name` and `content` must be strings. No other fields are required or consumed by the parser.

---

## Rules

| Rule | Detail |
|------|--------|
| Block appears once | The parser matches the first `<arc402_delivery>…</arc402_delivery>` in the agent output. Multiple blocks are not supported — only the first match is processed. |
| `deliverable.md` required | The parser checks `parsed.files.some(f => path.basename(f.name) === "deliverable.md")`. If absent, the block is treated as not extracted and the fallback fires. |
| File names are flattened | Each `name` is passed through `path.basename()`. Any path component (`../`, `subdir/`) is stripped. `subdir/report.md` → `report.md`. |
| No dotfiles | Files whose basename starts with `.` are silently skipped. |
| Content is a JSON string | Newlines must be escaped as `\n`, quotes as `\"`. Raw newlines inside JSON string values are a parse error. |
| Maximum total content | 1 MB across all file contents combined. Enforced by the daemon before the parser runs. |
| Excluded from collection | `task.md` and `job.log` are excluded from the delivery manifest even if written to the job directory. Do not include them in the delivery block. |

---

## Parser Behavior (source: `worker-executor.ts`)

### Step 1 — Block detection

```
regex: /<arc402_delivery>\s*([\s\S]*?)\s*<\/arc402_delivery>/
```

Applied to the full agent output (gateway response content or raw subprocess stdout). The inner capture group is passed to the JSON parser.

### Step 2 — JSON parse

The inner content is parsed as:

```typescript
{ files?: Array<{ name: string; content: string }> }
```

If `JSON.parse` throws, the parse error is logged and the fallback path fires.

### Step 3 — File extraction

For each entry in `files`:
- `name` is passed through `path.basename()` — path separators stripped
- Entries with a basename starting with `.` are skipped
- If `name` or `content` is not a string, the entry is skipped
- Each surviving file is written to the job staging directory: `~/.arc402/jobs/agreement-<id>/<name>`

### Step 4 — Delivered flag

If any extracted file has basename `deliverable.md`, the parser marks the delivery as successfully extracted (`extractedDeliverable = true`).

### Step 5 — Fallback

If:
- No `<arc402_delivery>` block was found, OR
- JSON parse failed, OR
- No file with basename `deliverable.md` was extracted

→ The entire raw agent output is written to `deliverable.md` with a header:

```
# Deliverable

Agreement: <agreement-id>
Capability: <capability>

---

<raw agent output>
```

The fallback produces valid on-chain delivery. The root hash covers the single fallback file.

### Step 6 — Root hash and manifest

After file extraction (or fallback), `FileDeliveryManager.storeDirectory()` is called on the job staging directory, excluding `task.md` and `job.log`. It:
- Lists all surviving files
- Computes a root hash over all file contents
- Returns a `DeliveryManifest: { root_hash: string; files: FileEntry[] }`

The root hash is committed on-chain via `commitDeliverable()`.

---

## JSON Encoding Reference

The most common error is unescaped content inside JSON strings. Because the entire `files` array is JSON, all file content must be valid JSON string values.

| Character | Escaped form |
|-----------|-------------|
| Newline | `\n` |
| Carriage return | `\r` |
| Tab | `\t` |
| Double quote | `\"` |
| Backslash | `\\` |

**Correct:**
```json
{"name":"report.md","content":"# Report\n\nLine one.\nLine two.\n\n## Section\n\nContent here."}
```

**Incorrect (raw newline inside string — JSON parse error):**
```json
{"name":"report.md","content":"# Report

Line one."}
```

---

## Agent Prompt Injection (from `buildTask()`)

The WorkerExecutor injects the following output instruction into every task prompt:

```
At the end of your response, you MUST include an <arc402_delivery> block containing ALL output
files as JSON. This is how your files are transferred to the delivery system. Format:

<arc402_delivery>
{"files":[{"name":"deliverable.md","content":"# Deliverable\n\n..."},{"name":"report.md","content":"..."}]}
</arc402_delivery>

Rules:
- ALWAYS include `deliverable.md` as a summary of your work
- Include ALL substantive output files (reports, code, data, etc.)
- File content must be valid JSON string (escape newlines as \n, quotes as \")
- Do NOT include task.md or job.log in the delivery block
```

Agents are expected to reproduce this format exactly. The instruction is always present in the task prompt — agents do not need to infer the format from the skill alone.

---

## Examples

### Research deliverable

```
<arc402_delivery>
{"files":[{"name":"deliverable.md","content":"# Research Summary\n\nCompleted analysis of topic X.\n\n## Key Findings\n\n1. Finding one.\n2. Finding two.\n\nSee report.md for full detail."},{"name":"report.md","content":"# Full Research Report\n\n## Introduction\n\n..."}]}
</arc402_delivery>
```

### Code deliverable

```
<arc402_delivery>
{"files":[{"name":"deliverable.md","content":"# Code Deliverable\n\nImplemented the requested function. See solution.py."},{"name":"solution.py","content":"def solve(n):\n    \"\"\"Solve the problem.\"\"\"\n    return n * 2\n"},{"name":"test_solution.py","content":"from solution import solve\n\ndef test_basic():\n    assert solve(5) == 10\n"}]}
</arc402_delivery>
```

### Data deliverable

```
<arc402_delivery>
{"files":[{"name":"deliverable.md","content":"# Data Processing Complete\n\nProcessed 1,000 records. Output in results.json."},{"name":"results.json","content":"{\"count\":1000,\"processed\":1000,\"errors\":0,\"data\":[]}"}]}
</arc402_delivery>
```

---

## Operator Notes

- **Do not attempt to parse delivery blocks outside the daemon.** The `FileDeliveryManager` handles root hash computation — replicating this externally risks hash mismatches that break on-chain verification.
- **The block is not a transport.** It is parsed by the daemon after the agent process exits. Agents do not need to call any API to submit files — emitting the block in their final message is sufficient.
- **Binary content is not supported.** File content must be UTF-8 text. For binary outputs, base64-encode the content and note the encoding in `deliverable.md`.
- **Test locally with `arc402 job manifest <id>`** after a workroom job completes to verify the manifest before checking on-chain state.

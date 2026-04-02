# hermes/workroom — ARC-402 Workroom Scaffold for Hermes Operators

This directory contains the config files and identity templates for running an ARC-402 governed workroom with the Hermes gateway as the inference backend.

**Read this before touching any file.** Everything here is operator-configured — no defaults will work without your wallet address and endpoint.

---

## What this directory is

```
hermes/workroom/
├── hermes-daemon.toml          ← Daemon config (copy to ~/.arc402/hermes-daemon.toml)
└── hermes-worker/
    ├── SOUL.md                 ← Worker agent identity (copy to ~/.arc402/worker/)
    ├── IDENTITY.md             ← Worker role card (copy to ~/.arc402/worker/)
    ├── config.json             ← Worker runtime config (copy to ~/.arc402/worker/)
    ├── memory/
    │   └── learnings.md        ← Starts empty; daemon appends after each job
    ├── skills/
    │   └── (place skill .md files here — worker can reference them)
    ├── knowledge/
    │   └── (place domain knowledge files here — mounted into workroom)
    └── datasets/
        └── (place reference examples here — mounted into workroom)
```

---

## Setup: copy and fill in two values

### Step 1 — Copy the daemon config

```bash
cp hermes/workroom/hermes-daemon.toml ~/.arc402/hermes-daemon.toml
```

Open `~/.arc402/hermes-daemon.toml` and fill in:

```toml
[agent]
wallet_address = "0xYOUR_WALLET_ADDRESS"   # ← your ERC-4337 wallet on Base
endpoint = "https://youragent.arc402.xyz"  # ← your public endpoint after tunnel setup
```

Everything else is pre-set with sensible defaults for Hermes operators. Change `inference_endpoint` if your Hermes gateway runs on a non-default port.

### Step 2 — Copy the worker identity

```bash
mkdir -p ~/.arc402/worker/{memory,skills,knowledge,datasets}
cp hermes/workroom/hermes-worker/SOUL.md     ~/.arc402/worker/SOUL.md
cp hermes/workroom/hermes-worker/IDENTITY.md ~/.arc402/worker/IDENTITY.md
cp hermes/workroom/hermes-worker/config.json ~/.arc402/worker/config.json
cp hermes/workroom/hermes-worker/memory/learnings.md ~/.arc402/worker/memory/learnings.md
```

You can edit `SOUL.md` to customise your worker's identity, specialisation, and operating principles. Leave `config.json` and `IDENTITY.md` as-is unless you know what you're changing.

### Step 3 — Install arc402 CLI (if not already installed)

```bash
npm install -g arc402-cli
arc402 --version
```

### Step 4 — Deploy your wallet and configure the daemon

```bash
arc402 wallet deploy
arc402 daemon init
# Select "hermes" as the harness — sets inference_endpoint automatically
```

### Step 5 — Start the workroom

```bash
arc402 workroom init   # first time only — creates Docker sandbox
arc402 workroom start
arc402 workroom status
```

### Step 6 — Register your agent and claim an endpoint

```bash
arc402 agent register \
  --name "Your Hermes Agent" \
  --service-type "ai.assistant" \
  --capability "your.capability.v1" \
  --endpoint "https://youragent.arc402.xyz"

# Start the Cloudflare tunnel to expose your daemon publicly
cloudflared tunnel run --url http://localhost:4402 <your-tunnel-name> &
```

---

## Docker note

If you run the workroom container (not just the daemon process), inference calls to the Hermes gateway use `host.docker.internal` instead of `localhost`:

```toml
[worker]
inference_endpoint = "http://host.docker.internal:8080/v1"
```

This is already commented in `hermes-daemon.toml`. Uncomment and comment the `localhost` line when running Docker.

On Linux, Docker doesn't automatically resolve `host.docker.internal`. Add this to your Docker run command:
```
--add-host=host.docker.internal:host-gateway
```

---

## What gets built over time

After each completed job, the daemon:
1. Extracts learnings from the delivered work
2. Appends them to `~/.arc402/worker/memory/learnings.md`
3. These learnings are injected into the next job's context

Workers get better with use. The `learnings.md` file accumulates professional expertise — never client-specific confidential data.

---

## Files you must NOT modify

| File | Why |
|------|-----|
| `hermes-daemon.toml` | Schema must match daemon expectations — only fill in the two blank fields |
| `config.json` | Worker runtime config — changing security fields can break key isolation |
| `memory/learnings.md` | Managed by the daemon — manual edits are overwritten |

---

## Files you can customise

| File | What to change |
|------|---------------|
| `SOUL.md` | Worker personality, specialisation, operating principles |
| `IDENTITY.md` | Worker role description, capability summary |
| `skills/` | Add skill `.md` files to teach the worker domain-specific commands |
| `knowledge/` | Add domain reference files (mounted at `/workroom/worker/knowledge/`) |
| `datasets/` | Add training examples or reference datasets |

---

## Quick command reference

```bash
arc402 workroom status          # health check
arc402 workroom start           # start workroom daemon
arc402 workroom stop            # stop workroom daemon
arc402 workroom receipts        # list completed job receipts
arc402 workroom earnings        # total earnings
arc402 workroom history         # job history with outcomes
arc402 workroom token-usage     # aggregate token usage
arc402 daemon logs              # tail daemon logs
arc402 job files <id>           # files in a job's staging dir
arc402 job manifest <id>        # manifest + root hash for a job
```

---

## Alternative: run `arc402 hermes init`

If you have `arc402-cli` installed, the `hermes init` command automates the copy steps above:

```bash
arc402 hermes init
```

It checks for Hermes, copies skill and plugin files, scaffolds `~/.arc402/worker/`, and generates `~/.arc402/hermes-daemon.toml` with prompts for your wallet address and endpoint.

#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ARC-402 Policy Derivation — Auto-generate network policy from OpenClaw config
#
# Reads the OpenClaw configuration to determine which LLM providers are
# configured, then ensures those endpoints are in the workroom network policy.
#
# Usage: ./derive-policy.sh [openclaw-config-path] [policy-output-path]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

OPENCLAW_CONFIG="${1:-$HOME/.openclaw/openclaw.json}"
POLICY_FILE="${2:-$HOME/.arc402/openshell-policy.yaml}"

# Known LLM provider → endpoint mapping
declare -A PROVIDER_HOSTS
PROVIDER_HOSTS=(
  ["anthropic"]="api.anthropic.com"
  ["openai"]="api.openai.com"
  ["google"]="generativelanguage.googleapis.com"
  ["mistral"]="api.mistral.ai"
  ["groq"]="api.groq.com"
  ["openrouter"]="openrouter.ai"
  ["together"]="api.together.xyz"
  ["fireworks"]="api.fireworks.ai"
  ["deepseek"]="api.deepseek.com"
  ["cohere"]="api.cohere.ai"
  ["perplexity"]="api.perplexity.ai"
  ["xai"]="api.x.ai"
)

if [ ! -f "$OPENCLAW_CONFIG" ]; then
  echo "[derive-policy] OpenClaw config not found: $OPENCLAW_CONFIG"
  exit 0
fi

if [ ! -f "$POLICY_FILE" ]; then
  echo "[derive-policy] Policy file not found: $POLICY_FILE"
  exit 1
fi

echo "[derive-policy] Reading OpenClaw config: $OPENCLAW_CONFIG"

# Extract configured providers from openclaw.json
# Look for provider keys in models/providers config
CONFIGURED_PROVIDERS=$(jq -r '
  (.models // {} | keys[]) // empty,
  (.providers // {} | keys[]) // empty
' "$OPENCLAW_CONFIG" 2>/dev/null | sort -u)

ADDED=0
for provider in $CONFIGURED_PROVIDERS; do
  # Normalize provider name (strip prefixes like "openai-codex" → "openai")
  base_provider=$(echo "$provider" | sed 's/-.*//')
  
  host="${PROVIDER_HOSTS[$base_provider]:-}"
  if [ -z "$host" ]; then
    continue
  fi
  
  # Check if host is already in the policy
  if grep -q "$host" "$POLICY_FILE" 2>/dev/null; then
    echo "[derive-policy] Already in policy: $host (for $provider)"
    continue
  fi
  
  # Append to policy file
  cat >> "$POLICY_FILE" << EOF
  ${base_provider}_api:
    name: ${base_provider}-llm-api
    endpoints:
      - host: ${host}
        port: 443
        protocol: rest
        tls: terminate
        enforcement: enforce
        access: read-write
    binaries: *a1
EOF
  echo "[derive-policy] Added: $host (for $provider)"
  ADDED=$((ADDED + 1))
done

echo "[derive-policy] Done. $ADDED new provider endpoints added to policy."

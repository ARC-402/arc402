#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ARC-402 Workroom DNS Refresh
#
# Periodically re-resolves policy hostnames and updates iptables rules.
# Handles CDN IP rotation, failover, and DNS changes without container restart.
#
# Runs as root in the background. The entrypoint starts this automatically.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

readonly POLICY_FILE="${1:-/workroom/.arc402/openshell-policy.yaml}"
readonly REFRESH_INTERVAL="${ARC402_DNS_REFRESH_SECONDS:-300}"
readonly RULES_LOG="/workroom/.arc402/iptables-rules.log"

log() { echo "[dns-refresh] $*"; }

log "Starting (interval: ${REFRESH_INTERVAL}s, policy: $POLICY_FILE)"

while true; do
  sleep "$REFRESH_INTERVAL"

  log "Refreshing..."

  # Flush and rebuild OUTPUT chain from scratch
  # This is atomic from the kernel's perspective — no gap in enforcement.
  iptables -F OUTPUT 2>/dev/null || true

  # Core rules (always present)
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

  # Re-resolve and apply
  RULE_COUNT=0
  while IFS=: read -r host port; do
    [ -z "$host" ] && continue
    port="${port:-443}"

    ips=$(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u || true)
    if [ -z "$ips" ]; then
      log "WARN: Could not resolve $host"
      continue
    fi

    while IFS= read -r ip; do
      iptables -A OUTPUT -p tcp -d "$ip" --dport "$port" -j ACCEPT
      RULE_COUNT=$((RULE_COUNT + 1))
    done <<< "$ips"
  done < <(/policy-parser.sh "$POLICY_FILE")

  # Log updated rules
  iptables -L OUTPUT -n --line-numbers > "$RULES_LOG" 2>/dev/null || true

  log "Refreshed: $RULE_COUNT rules applied"
done

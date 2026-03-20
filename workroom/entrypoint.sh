#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ARC-402 Workroom Entrypoint
#
# This is the governed execution environment for hired work. The entrypoint:
#   1. Reads the workroom policy (YAML → host:port pairs)
#   2. Resolves all hostnames to IPs while DNS is still open
#   3. Applies iptables rules: ALLOW resolved IPs, DROP everything else
#   4. Starts the DNS refresh daemon for IP rotation
#   5. Drops privileges and starts the ARC-402 daemon
#
# Runs as root for iptables setup. Drops to 'workroom' user for the daemon.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

readonly POLICY_FILE="/workroom/.arc402/openshell-policy.yaml"
readonly RULES_LOG="/workroom/.arc402/iptables-rules.log"
readonly DAEMON_ENTRY="/workroom/runtime/dist/daemon/index.js"
readonly ARENA_POLICY="/workroom/.arc402/arena-policy.yaml"
readonly ARENA_DEFAULT="/workroom/defaults/arena-policy.yaml"

log() { echo "[workroom] $*"; }

# ─── Validate prerequisites ────────────────────────────────────────────────

if [ ! -f "$POLICY_FILE" ]; then
  log "ERROR: Policy file not found at $POLICY_FILE"
  log "Run 'arc402 workroom init' on the host first."
  exit 1
fi

# ─── Phase 1: Resolve all policy hosts (DNS is still open) ─────────────────
#
# We resolve hostnames BEFORE applying the DROP policy. Once DROP is active,
# only explicitly allowed IPs are reachable. By resolving first, we capture
# the current DNS state into concrete IP rules.

declare -a RESOLVED_IPS=()
declare -a RESOLVED_PORTS=()
RESOLVE_COUNT=0

resolve_policy_hosts() {
  local policy_file="$1"

  while IFS=: read -r host port; do
    [ -z "$host" ] && continue
    port="${port:-443}"

    local ips
    ips=$(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u || true)

    if [ -z "$ips" ]; then
      log "WARN: Could not resolve $host — skipping"
      continue
    fi

    local ip_count
    ip_count=$(echo "$ips" | wc -l | tr -d ' ')
    log "Resolved: $host → $ip_count IPs"

    while IFS= read -r ip; do
      RESOLVED_IPS+=("$ip")
      RESOLVED_PORTS+=("$port")
      RESOLVE_COUNT=$((RESOLVE_COUNT + 1))
    done <<< "$ips"
  done < <(/policy-parser.sh "$policy_file")
}

log "Resolving policy hosts..."
resolve_policy_hosts "$POLICY_FILE"

# Also resolve arena policy if present
if [ -f "$ARENA_POLICY" ]; then
  resolve_policy_hosts "$ARENA_POLICY"
elif [ -f "$ARENA_DEFAULT" ]; then
  resolve_policy_hosts "$ARENA_DEFAULT"
fi

# ─── Phase 2: Apply network enforcement ────────────────────────────────────
#
# Default policy: DROP all outbound.
# Exceptions: loopback, established connections, DNS, and resolved policy hosts.
#
# DNS is allowed broadly (not just 127.0.0.11) because the daemon and worker
# need to resolve hostnames at runtime. The iptables rules restrict which IPs
# are reachable, so DNS resolution alone doesn't grant access — only hosts
# whose IPs match a rule can actually be connected to.

iptables -P OUTPUT DROP 2>/dev/null || true
iptables -F OUTPUT 2>/dev/null || true

# Core rules: loopback, established, DNS
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

log "Default policy: DROP all outbound (except loopback, established, DNS)"

# Apply resolved IP rules
for i in "${!RESOLVED_IPS[@]}"; do
  iptables -A OUTPUT -p tcp -d "${RESOLVED_IPS[$i]}" --dport "${RESOLVED_PORTS[$i]}" -j ACCEPT
done

log "$RESOLVE_COUNT iptables rules applied"

# ─── Phase 3: Log applied rules ───────────────────────────────────────────

iptables -L OUTPUT -n --line-numbers > "$RULES_LOG" 2>/dev/null || true
log "Rules logged to $RULES_LOG"

# ─── Phase 4: Start DNS refresh daemon ─────────────────────────────────────
#
# Hostnames may resolve to different IPs over time (CDN rotation, failover).
# The refresh daemon re-resolves all policy hosts periodically and atomically
# updates iptables rules.

/dns-refresh.sh "$POLICY_FILE" &
local_dns_pid=$!
log "DNS refresh daemon started (PID: $local_dns_pid, interval: ${ARC402_DNS_REFRESH_SECONDS:-300}s)"

# ─── Phase 5: Validate daemon entry point ──────────────────────────────────

if [ ! -f "$DAEMON_ENTRY" ]; then
  log "ERROR: Daemon entry point not found at $DAEMON_ENTRY"
  log "The ARC-402 runtime bundle must be mounted at /workroom/runtime/"
  log "Expected mount: -v /path/to/cli/dist:/workroom/runtime/dist:ro"
  exit 1
fi

# ─── Phase 6: Ensure workroom user can write state files ───────────────────

chown -R workroom:workroom /workroom/.arc402 2>/dev/null || true
chown -R workroom:workroom /workroom/jobs 2>/dev/null || true

# ─── Phase 7: Drop privileges and start daemon ────────────────────────────

log "Starting ARC-402 daemon as user 'workroom'..."
exec su -s /bin/bash workroom -c "node $DAEMON_ENTRY --foreground"

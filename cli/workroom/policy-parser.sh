#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# ARC-402 Workroom Policy Parser
#
# Reads the workroom policy YAML and outputs HOST:PORT pairs, one per line.
# Used by the entrypoint and DNS refresh scripts to build iptables rules.
#
# Input:  YAML file with network_policies.<name>.endpoints[].host/port
# Output: hostname:port (one per line, to stdout)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

readonly POLICY_FILE="${1:-/workroom/.arc402/openshell-policy.yaml}"

if [ ! -f "$POLICY_FILE" ]; then
  echo "ERROR: Policy file not found: $POLICY_FILE" >&2
  exit 1
fi

# Extract host:port pairs from the YAML network_policies section.
# Each policy block contains endpoints with host and port fields.
awk '
  /host:/ { gsub(/.*host: */, ""); host = $0 }
  /port:/ { gsub(/.*port: */, ""); if (host != "") { print host ":" $0; host = "" } }
' "$POLICY_FILE"

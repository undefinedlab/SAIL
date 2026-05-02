#!/bin/sh
set -e

PORT="${PORT:-9002}"
BRIDGE_ADDR="${AXL_BRIDGE_BIND:-0.0.0.0}"
TCP_PORT="${AXL_TCP_PORT:-7000}"
KEY="${AXL_PRIVATE_KEY_PATH:-/app/private.pem}"
CFG="${AXL_CONFIG_PATH:-/app/node-config.json}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl required" >&2
  exit 1
fi

if [ ! -f "$KEY" ]; then
  echo "[AXL] generating ed25519 key at $KEY"
  openssl genpkey -algorithm ed25519 -out "$KEY"
fi

# Minimal config aligned with backend/gensyn/node.ts writeConfig shape.
# Optional peers: set AXL_PEERS to comma-separated multiaddrs/peer entries if your network needs them.
printf '%s\n' "{
  \"PrivateKeyPath\": \"${KEY}\",
  \"Peers\": [],
  \"api_port\": ${PORT},
  \"bridge_addr\": \"${BRIDGE_ADDR}\",
  \"tcp_port\": ${TCP_PORT}
}" > "$CFG"

echo "[AXL] listening HTTP bridge on ${BRIDGE_ADDR}:${PORT} (tcp ${TCP_PORT})"
exec /app/node -config "$CFG"

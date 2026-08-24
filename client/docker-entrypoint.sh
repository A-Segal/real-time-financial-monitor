#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# docker-entrypoint.sh — Frontend container entrypoint
#
# Generates /usr/share/nginx/html/config.js from the VITE_API_URL environment
# variable (or falls back to an empty string), then starts nginx.
#
# This allows a single frontend Docker image to work with any backend URL
# without rebuilding the JavaScript bundle.
# ---------------------------------------------------------------------------

CONFIG_FILE=/usr/share/nginx/html/config.js

cat > "$CONFIG_FILE" <<EOF
// Runtime configuration — generated at container start.
// Do not edit; set VITE_API_URL in the container environment.
window.__RUNTIME_CONFIG__ = {
  apiUrl: '${VITE_API_URL:-}',
};
EOF

echo "Generated $CONFIG_FILE with VITE_API_URL='${VITE_API_URL:-}'"

exec nginx -g 'daemon off;'

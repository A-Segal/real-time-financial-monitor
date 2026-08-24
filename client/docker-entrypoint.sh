#!/bin/sh
set -e

# Runtime config injection from VITE_API_URL env var
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

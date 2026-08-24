# ---------------------------------------------------------------------------
# nginx load-balancer image for Real-Time Financial Monitor.
#
# Uses official nginx:alpine with a custom entrypoint that:
#   1. Resolves the "backend" hostname via Docker DNS to discover ALL
#      replica IPs at startup
#   2. Generates upstream blocks with one `server <ip>:8080` per unique IP
#   3. Starts nginx
#   4. Background watcher re-resolves every 10s and SIGHUPs nginx on
#      IP-set changes (e.g. after docker compose scale)
#
# Two upstream pools are generated:
#   backend_api      — Round Robin for /api/ routes
#   backend_signalr  — hash $cookie_signalr_id consistent for /hubs/ routes
#
# This approach avoids nginx's built-in `resolve` parameter which has known
# issues with DNS round-robin and consistent hashing.
# ---------------------------------------------------------------------------

FROM nginx:alpine

# Install getent (part of busybox) — already present in alpine

# Remove the default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

STOPSIGNAL SIGQUIT

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]

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

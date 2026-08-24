#!/bin/sh
set -e

# Ensure /app/data is writable by appuser.
# Docker named volumes are owned by root when first created,
# so we need to set ownership at runtime (we run as root in entrypoint).
mkdir -p /app/data
chown -R appuser:appuser /app/data

# Drop privileges to appuser and launch the app
exec gosu appuser dotnet FinancialMonitor.Api.dll "$@"

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["server/FinancialMonitor.Api/FinancialMonitor.Api/FinancialMonitor.Api.csproj", "server/FinancialMonitor.Api/FinancialMonitor.Api/"]
RUN dotnet restore "server/FinancialMonitor.Api/FinancialMonitor.Api/FinancialMonitor.Api.csproj"

# Copy all source code
COPY server/ server/

WORKDIR "/src/server/FinancialMonitor.Api/FinancialMonitor.Api"
RUN dotnet publish "FinancialMonitor.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

RUN adduser --disabled-password --gecos '' appuser \
    && apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=appuser /app/publish .

COPY server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Entrypoint runs as root to fix volume permissions, then drops to appuser via su-exec

EXPOSE 8080

ENV ASPNETCORE_ENVIRONMENT=Docker
ENV ASPNETCORE_URLS=http://0.0.0.0:8080

ENTRYPOINT ["/app/entrypoint.sh"]

using FinancialMonitor.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FinancialMonitor.Api.IntegrationTests;

/// <summary>
///     Boots the <em>real</em> <c>FinancialMonitor.Api</c> application in-memory with a
///     <see cref="WebApplicationFactory"/>, but swaps the file-backed SQLite database for
///     a fresh, isolated <em>in-memory</em> SQLite database kept alive on a shared
///     connection for the lifetime of the factory.
///
///     <para>
///         Only the database <em>connection</em> is swapped (the canonical ASP.NET Core /
///         EF Core integration-testing pattern); everything else — controller, service,
///         repository, the EF SQLite provider, and the real <c>Program</c> startup that
///         runs <c>Database.Migrate()</c> — is the genuine production code. Nothing is
///         mocked and no state is shared between tests.
///     </para>
///
///     <para>
///         Because the data lives on an in-memory connection that this factory owns, it
///         is destroyed automatically when the factory disposes — no temp files, no disk
///         locks, deterministic cleanup.
///     </para>
///
///     <para>
///         SignalR (<see cref="Hubs.TransactionHub"/>) is registered by <c>Program</c>
///         exactly as in production. Since no WebSocket clients connect in these tests,
///         the service's <c>SendAsync</c> calls complete successfully against an empty
///         client list. Verifying the SignalR protocol itself is deliberately deferred to
///         the dedicated SignalR integration-testing phase.
///     </para>
/// </summary>
public sealed class TestApplicationFactory : WebApplicationFactory<Program>
{
    // In-memory SQLite disappears the moment its last connection closes, so this
    // connection is kept open for the whole life of the factory (and disposed with it).
    private readonly SqliteConnection _connection;

    public TestApplicationFactory()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        // Match the production busy_timeout (5 seconds, see Program.cs).
        // Without this PRAGMA, concurrent reads fail immediately with
        // SQLITE_BUSY instead of waiting for the write to complete.
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = "PRAGMA busy_timeout=5000;";
        cmd.ExecuteNonQuery();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Override the connection string to point at our in-memory SQLite database.
        // Program.cs opens this connection and applies the WAL/busy PRAGMAs before EF
        // Core registers, so we must replace it at the config level too.
        builder.UseSetting("ConnectionStrings:DefaultConnection", "Data Source=:memory:");

        // Ensure the Redis backplane is NOT configured during these tests (no Redis
        // dependency for the standard integration tests). The web host defaults to the
        // "Development" environment which loads appsettings.Development.json, but that
        // file now contains a Redis:ConnectionString for local development. We override
        // it to empty so these tests run without Redis.
        builder.UseSetting("Redis:ConnectionString", "");

        builder.ConfigureServices(services =>
        {
            // Replace the real (file-backed) DbContext options with options that target
            // this test's in-memory connection. Program's scoped AppDbContext then uses
            // these options when the real startup runs Database.Migrate().
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));

            if (descriptor is not null)
            {
                services.Remove(descriptor);
            }

            // These options keep the AppDbContext pinned to this test's open in-memory
            // connection, so the real startup migration and all requests share one DB.
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite(_connection)
                .Options;

            services.AddSingleton(options);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            _connection.Dispose();
        }
    }

    /// <summary>
    ///     <see cref="WebApplicationFactory{T}.DisposeAsync"/> does not route through
    ///     <see cref="Dispose(bool)"/>, so the shared connection is released here too.
    ///     Dropping it destroys the in-memory database without leaving any files behind.
    /// </summary>
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        _connection.Dispose();
    }
}

using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.Repositories;
using FinancialMonitor.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(
            new JsonStringEnumConverter()));

builder.Services.AddScoped<ITransactionRepository, TransactionRepository>();
builder.Services.AddScoped<ITransactionService, TransactionService>();

// SQLite with WAL mode and busy_timeout for shared-volume concurrency.
// A single open SqliteConnection is passed to EF Core so the WAL PRAGMAs
// applied on first open are guaranteed to take effect on the connection
// EF Core uses internally.
var sqliteConnection = new SqliteConnection(
    builder.Configuration.GetConnectionString("DefaultConnection"));

sqliteConnection.Open();
using (var pragmaCmd = sqliteConnection.CreateCommand())
{
    pragmaCmd.CommandText = "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;";
    pragmaCmd.ExecuteNonQuery();
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(sqliteConnection));

var redisConnectionString = builder.Configuration["Redis:ConnectionString"];

if (!string.IsNullOrEmpty(redisConnectionString))
{
    builder.Services.AddSignalR()
        .AddStackExchangeRedis(redisConnectionString, redisOptions =>
        {
            redisOptions.Configuration.ChannelPrefix = RedisChannel.Literal("FinancialMonitor");
        });
}
else
{
    builder.Services.AddSignalR();
}

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()
              .SetIsOriginAllowed(_ => true);
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        var instanceId = Environment.MachineName;

        if (!context.Response.Headers.ContainsKey("X-Backend-Instance"))
        {
            context.Response.Headers["X-Backend-Instance"] = instanceId;
        }

        return Task.CompletedTask;
    });
    await next();
});

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

if (!app.Environment.IsEnvironment("Docker"))
{
    app.UseHttpsRedirection();
}

app.MapControllers();

app.MapHub<FinancialMonitor.Api.Hubs.TransactionHub>("/hubs/transactions");

app.MapGet("/lb-debug", (HttpContext context) =>
{
    var hasCookie = context.Request.Cookies.ContainsKey("signalr_id");
    var cookieValue = context.Request.Cookies["signalr_id"] ?? "(none)";
    var allCookies = string.Join("; ", context.Request.Cookies.Select(c => $"{c.Key}={c.Value}"));

    return Results.Ok(new
    {
        instance = Environment.MachineName,
        sticky = new
        {
            backendInstance = Environment.MachineName,
            cookiePresent = hasCookie,
            cookieValue,
            allCookies = allCookies
        },
        headers = new
        {
            xForwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault(),
            xRealIp = context.Request.Headers["X-Real-IP"].FirstOrDefault()
        },
        timestamp = DateTime.UtcNow.ToString("O")
    });
});

app.MapGet("/sticky-test", () => Results.Ok(new
{
    status = "StickyTest",
    instance = Environment.MachineName
}));

app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    instance = Environment.MachineName
}));

app.Run();

public partial class Program
{
}
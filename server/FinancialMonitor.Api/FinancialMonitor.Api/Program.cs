using FinancialMonitor.Api.Data;
using FinancialMonitor.Api.Repositories;
using FinancialMonitor.Api.Services;
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

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(
        builder.Configuration.GetConnectionString("DefaultConnection")));

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

app.UseHttpsRedirection();

app.MapControllers();

app.MapHub<FinancialMonitor.Api.Hubs.TransactionHub>("/hubs/transactions");

app.Run();

public partial class Program
{
}
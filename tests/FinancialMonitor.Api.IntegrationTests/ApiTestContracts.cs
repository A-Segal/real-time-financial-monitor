using System.Text.Json;

namespace FinancialMonitor.Api.IntegrationTests;

/// <summary>
///     Shared HTTP/SignalR wire contracts for the integration tests. These small DTO
///     mirrors exist so the black-box HTTP tests can build requests and read responses
///     without binding to the production DTO types (the request <c>Status</c> deliberately
///     stays a <see cref="string"/> so tests can exercise invalid-status rejection the same
///     way a real JSON client would).
///
///     They are defined in exactly one place so a change to the API contract updates a
///     single file instead of drifting independently across test classes.
/// </summary>
internal static class ApiTestContracts
{
    /// <summary>The controller route prefix shared by every test's HTTP calls.</summary>
    public const string BasePath = "/api/transactions";

    /// <summary>
    ///     JSON options used to read HTTP response bodies. The API serializes with the
    ///     default ASP.NET Core casing (camelCase), so member-name matching is required.
    /// </summary>
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public sealed record CreateTransactionRequestDto
    {
        public decimal Amount { get; init; }
        public string Currency { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
    }

    public sealed record UpdateTransactionStatusRequestDto
    {
        public string Status { get; init; } = string.Empty;
    }

    public sealed class TransactionDto
    {
        public Guid TransactionId { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}

using System.Text.Json;

namespace FinancialMonitor.Api.IntegrationTests;

internal static class ApiTestContracts
{
    public const string BasePath = "/api/transactions";

    public static readonly JsonSerializerOptions JsonOptions
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

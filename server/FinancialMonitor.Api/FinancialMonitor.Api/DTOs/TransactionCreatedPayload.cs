namespace FinancialMonitor.Api.DTOs;


public class TransactionCreatedPayload
{
    public Guid TransactionId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }
}

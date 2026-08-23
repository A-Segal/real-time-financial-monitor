namespace FinancialMonitor.Api.DTOs;

/// <summary>
/// Payload broadcast over SignalR for the "TransactionCreated" event.
/// Distinct from the REST <see cref="TransactionResponse"/> so that the
/// status is delivered to clients as a string rather than a numeric enum.
/// </summary>
public class TransactionCreatedPayload
{
    public Guid TransactionId { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }
}

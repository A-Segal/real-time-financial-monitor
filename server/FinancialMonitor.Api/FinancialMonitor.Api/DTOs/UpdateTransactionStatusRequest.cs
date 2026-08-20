using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.DTOs;

/// <summary>Request payload for updating a transaction's status.</summary>
public class UpdateTransactionStatusRequest
{
    public TransactionStatus status { get; set; }
}

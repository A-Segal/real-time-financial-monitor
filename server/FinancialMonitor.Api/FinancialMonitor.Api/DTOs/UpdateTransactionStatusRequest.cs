using FinancialMonitor.Api.Models;

namespace FinancialMonitor.Api.DTOs;

public class UpdateTransactionStatusRequest
{
    public TransactionStatus Status { get; set; }
}

using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FinancialMonitor.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;
    private readonly ILogger<TransactionsController> _logger;

    public TransactionsController(
        ITransactionService transactionService,
        ILogger<TransactionsController> logger)
    {
        _transactionService = transactionService;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<TransactionResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllTransactions()
    {
        var transactions = await _transactionService.GetAllTransactionsAsync();

        return Ok(transactions);
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AddTransaction([FromBody] CreateTransactionRequest request)
    {
        try
        {
            var created = await _transactionService.AddTransactionAsync(request);

            return StatusCode(StatusCodes.Status201Created, created);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid create transaction request: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error creating transaction.");
            throw;
        }
    }

    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateTransactionStatus(
        [FromRoute] Guid id,
        [FromBody] UpdateTransactionStatusRequest request)
    {
        try
        {
            await _transactionService.UpdateTransactionStatusAsync(id, request);

            return NoContent();
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Transaction {TransactionId} not found for status update.", id);
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Transaction {TransactionId} is not in a state that allows a status update.", id);
            return Conflict(ex.Message);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid status update request for transaction {TransactionId}: {Message}", id, ex.Message);
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error updating status for transaction {TransactionId}.", id);
            throw;
        }
    }
}

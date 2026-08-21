using FinancialMonitor.Api.DTOs;
using FinancialMonitor.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FinancialMonitor.Api.Controllers;

/// <summary>Exposes HTTP endpoints for managing transactions.</summary>
[ApiController]
[Route("api/[controller]")]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
        _transactionService = transactionService;
    }

    /// <summary>Retrieves all transactions.</summary>
    /// <returns>200 OK with the list of transactions.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<TransactionResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllTransactions()
    {
        var transactions = await _transactionService.GetAllTransactionsAsync();

        return Ok(transactions);
    }

    /// <summary>Creates a new transaction.</summary>
    /// <param name="request">The transaction payload.</param>
    /// <returns>201 Created when the transaction is successfully added.</returns>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AddTransaction([FromBody] CreateTransactionRequest request)
    {
        try
        {
            await _transactionService.AddTransactionAsync(request);

            return StatusCode(StatusCodes.Status201Created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>Updates the status of an existing transaction.</summary>
    /// <param name="id">The transaction ID.</param>
    /// <param name="request">The new status payload.</param>
    /// <returns>204 No Content when the status is successfully updated.</returns>
    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
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
            return NotFound(ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}

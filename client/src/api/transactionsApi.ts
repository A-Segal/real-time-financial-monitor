import { isTransactionStatus } from '../types/transaction'
import type { Transaction, TransactionStatus } from '../types/transaction'

const API_BASE = '/api'

export class ApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchTransactions(): Promise<Transaction[]> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/transactions`)
  } catch {
    throw new ApiError(
      'Unable to reach the server. Please verify the API is running and check your connection.',
    )
  }

  if (!response.ok) {
    throw new ApiError(
      `Failed to load transactions (HTTP ${response.status}).`,
      response.status,
    )
  }

  try {
    const data: unknown = await response.json()
    return normalizeTransactions(data)
  } catch {
    throw new ApiError(
      'The server returned an unexpected response that could not be parsed.',
      response.status,
    )
  }
}

function normalizeTransactions(data: unknown): Transaction[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of transactions.')
  }

  return data.map((item, index) => normalizeTransaction(item, index))
}

function normalizeTransaction(item: unknown, index: number): Transaction {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`Transaction at index ${index} is not an object.`)
  }

  const entry = item as Record<string, unknown>

  if (
    typeof entry.transactionId !== 'string' ||
    typeof entry.amount !== 'number' ||
    typeof entry.currency !== 'string' ||
    typeof entry.status !== 'string' ||
    typeof entry.timestamp !== 'string'
  ) {
    throw new Error(`Transaction at index ${index} has an unexpected shape.`)
  }

  return {
    transactionId: entry.transactionId,
    amount: entry.amount,
    currency: entry.currency,
    status: normalizeStatus(entry.status),
    timestamp: entry.timestamp,
  }
}

function normalizeStatus(status: string): TransactionStatus {
  if (isTransactionStatus(status)) {
    return status
  }
  throw new Error(`Unknown transaction status: "${status}".`)
}

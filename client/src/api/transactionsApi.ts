import type { Transaction } from '../types/transaction'

/**
 * Base path for all API calls. The Vite dev server proxies "/api" to the
 * backend (see vite.config.ts), so calls stay same-origin in development
 * and can be served by the backend in production.
 */
const API_BASE = '/api'

/**
 * Custom error that carries a human-readable message plus, when available,
 * the underlying HTTP status code for debugging.
 */
export class ApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Fetches all transactions from `GET /api/transactions`.
 *
 * Throws an `ApiError` when the response is not OK or the body cannot be
 * parsed, so callers can distinguish "no data" from "request failed".
 */
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

/**
 * Validates the parsed JSON has the expected shape and normalizes each entry
 * into a `Transaction`. Rejects malformed payloads instead of silently
 * rendering `undefined` fields.
 */
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

const VALID_STATUSES = ['Pending', 'Completed', 'Failed'] as const

function normalizeStatus(status: string): Transaction['status'] {
  if ((VALID_STATUSES as readonly string[]).includes(status)) {
    return status as Transaction['status']
  }
  throw new Error(`Unknown transaction status: "${status}".`)
}

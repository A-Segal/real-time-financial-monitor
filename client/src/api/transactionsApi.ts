import { isTransactionStatus } from '../types/transaction'
import type { Transaction, TransactionStatus } from '../types/transaction'

/**
 * Returns the runtime API base URL.
 * Priority:
 *   1. window.__RUNTIME_CONFIG__.apiUrl (set at container start by nginx envsubst)
 *   2. import.meta.env.VITE_API_URL (build-time Vite env var, used in dev)
 *   3. '' (relative URLs, works with Vite proxy in dev)
 */
function apiBaseUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.__RUNTIME_CONFIG__?.apiUrl &&
    window.__RUNTIME_CONFIG__.apiUrl !== '$VITE_API_URL'
  ) {
    return window.__RUNTIME_CONFIG__.apiUrl
  }
  return (import.meta.env.VITE_API_URL ?? '')
}

function apiUrl(path: string): string {
  const base = apiBaseUrl().replace(/\/+$/, '')
  return `${base}${path}`
}

export class ApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface CreateTransactionInput {
  amount: number
  currency: string
  status: TransactionStatus
}

export async function fetchTransactions(): Promise<Transaction[]> {
  let response: Response
  try {
    response = await fetch(apiUrl('/api/transactions'))
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

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  let response: Response
  try {
    response = await fetch(apiUrl('/api/transactions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new ApiError(
      'Unable to reach the server. Please verify the API is running and check your connection.',
    )
  }

  if (!response.ok) {
    throw new ApiError(
      `Failed to create transaction (HTTP ${response.status}).`,
      response.status,
    )
  }

  try {
    const data: unknown = await response.json()
    return normalizeTransaction(data, 0)
  } catch {
    throw new ApiError(
      'The server returned an unexpected response that could not be parsed.',
      response.status,
    )
  }
}

export async function updateTransactionStatus(
  transactionId: string,
  status: TransactionStatus,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl(`/api/transactions/${transactionId}/status`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  } catch {
    throw new ApiError(
      'Unable to reach the server. Please verify the API is running and check your connection.',
    )
  }

  if (!response.ok) {
    throw new ApiError(
      `Failed to update transaction status (HTTP ${response.status}).`,
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

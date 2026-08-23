import { useCallback, useEffect, useState } from 'react'
import { fetchTransactions } from '../api/transactionsApi'
import type { Transaction } from '../types/transaction'

interface UseTransactionsResult {
  transactions: Transaction[]
  isLoading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads transactions from the API and tracks the request lifecycle.
 *
 * - `isLoading` is true only while the initial request is in flight.
 * - `error` holds a user-facing message when the request fails.
 * - `reload` re-fetches, useful for a retry button.
 */
export function useTransactions(): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      setIsLoading(true)

      try {
        const data = await fetchTransactions()
        if (!cancelled) setTransactions(data)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load transactions.',
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { transactions, isLoading, error, reload }
}

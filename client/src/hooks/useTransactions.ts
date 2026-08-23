import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTransactions } from '../api/transactionsApi'
import { connectToTransactionsHub } from '../api/transactionsHub'
import type { Transaction } from '../types/transaction'

interface UseTransactionsResult {
  transactions: Transaction[]
  isLoading: boolean
  error: string | null
  reload: () => void
}

export function useTransactions(): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loadingRef = useRef(true)
  const pendingCreatedRef = useRef(new Map<string, Transaction>())

  useEffect(() => {
    let cancelled = false

    async function load() {
      loadingRef.current = true
      setError(null)
      setIsLoading(true)

      try {
        const data = await fetchTransactions()
        if (!cancelled) {
          setTransactions((prev) => {
            const apiIds = new Set(data.map((txn) => txn.transactionId))
            const pending = [...pendingCreatedRef.current.values()].filter(
              (txn) => !apiIds.has(txn.transactionId),
            )
            pendingCreatedRef.current.clear()
            const liveState = prev.filter(
              (txn) => !apiIds.has(txn.transactionId),
            )
            return [...pending, ...data, ...liveState.filter(
              (txn) => !pending.some((created) => created.transactionId === txn.transactionId),
            )]
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load transactions.',
          )
        }
      } finally {
        if (!cancelled) {
          loadingRef.current = false
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    let cancelled = false

    const hub = connectToTransactionsHub({
      onTransactionCreated: (incoming) => {
        if (cancelled) return

        setTransactions((prev) => {
          if (prev.some((txn) => txn.transactionId === incoming.transactionId)) {
            return prev
          }
          if (loadingRef.current) {
            pendingCreatedRef.current.set(incoming.transactionId, incoming)
          }
          return [incoming, ...prev]
        })
      },
      onTransactionStatusUpdated: ({ transactionId, status }) => {
        if (cancelled) return

        setTransactions((prev) =>
          prev.map((txn) =>
            txn.transactionId === transactionId ? { ...txn, status } : txn,
          ),
        )
      },
    })

    return () => {
      cancelled = true
      void hub.teardown()
    }
  }, [])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { transactions, isLoading, error, reload }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTransactions } from '../api/transactionsApi'
import { connectToTransactionsHub } from '../api/transactionsHub'
import type { Dispatch, SetStateAction } from 'react'
import type { Transaction } from '../types/transaction'

interface UseTransactionsResult {
  transactions: Transaction[]
  setTransactions: Dispatch<SetStateAction<Transaction[]>>
  isLoading: boolean
  error: string | null
  reload: () => void
}

export function useTransactions(
  onNewTransaction?: (txn: Transaction) => void,
  onStatusUpdated?: (transactionId: string) => void,
): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loadingRef = useRef(true)
  const pendingCreatedRef = useRef(new Map<string, Transaction>())
  // Track seen transaction IDs to avoid duplicate callbacks
  const knownIdsRef = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false

    async function load() {
      loadingRef.current = true
      setError(null)
      setIsLoading(true)

      try {
        const data = await fetchTransactions()
        if (!cancelled) {
          // Populate known IDs from initial data to avoid snackbar for existing transactions
          data.forEach((txn) => knownIdsRef.current.add(txn.transactionId))

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

  // Keep refs to callbacks to avoid stale closures in the SignalR callback
  const onNewTxnRef = useRef(onNewTransaction)
  onNewTxnRef.current = onNewTransaction
  const onStatusUpdatedRef = useRef(onStatusUpdated)
  onStatusUpdatedRef.current = onStatusUpdated

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

        // Notify about genuinely new transactions we haven't seen before.
        // Use knownIdsRef to prevent duplicate callbacks even if the same
        // SignalR event arrives multiple times.
        if (!knownIdsRef.current.has(incoming.transactionId)) {
          knownIdsRef.current.add(incoming.transactionId)
          onNewTxnRef.current?.(incoming)
        }
      },
      onTransactionStatusUpdated: ({ transactionId, status }) => {
        if (cancelled) return

        setTransactions((prev) =>
          prev.map((txn) =>
            txn.transactionId === transactionId ? { ...txn, status } : txn,
          ),
        )

        onStatusUpdatedRef.current?.(transactionId)
      },
    })

    return () => {
      cancelled = true
      void hub.teardown()
    }
  }, [])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { transactions, setTransactions, isLoading, error, reload }
}

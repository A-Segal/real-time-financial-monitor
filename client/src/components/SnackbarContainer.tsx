import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../types/transaction'

// ---------------------------------------------------------------------------
// Snackbar phase lifecycle:
//   entering (slide-in) → visible (4s) → exiting (slide-out) → removed
// ---------------------------------------------------------------------------

type Phase = 'entering' | 'visible' | 'exiting'

interface SnackbarItem {
  id: string
  transaction: Transaction
  phase: Phase
}

// ---------------------------------------------------------------------------
// SnackbarContainer — receives new transactions and manages their lifecycle
// ---------------------------------------------------------------------------

interface SnackbarContainerProps {
  /** New transaction objects to show as snackbars (deduped by transactionId) */
  newTransactions: Transaction[]
  /** Called after a snackbar has been fully consumed (exited and removed).
   *  The parameter is the transactionId of the consumed snackbar. */
  onConsumed: (transactionId: string) => void
}

export default function SnackbarContainer({
  newTransactions,
  onConsumed,
}: SnackbarContainerProps) {
  const [items, setItems] = useState<SnackbarItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const idCounterRef = useRef(0)
  const seenRef = useRef(new Set<string>())

  // Process incoming new transactions
  useEffect(() => {
    if (newTransactions.length === 0) return

    setItems((prev) => {
      const existingIds = new Set(prev.map((item) => item.transaction.transactionId))
      const additions: SnackbarItem[] = []

      for (const txn of newTransactions) {
        if (!existingIds.has(txn.transactionId) && !seenRef.current.has(txn.transactionId)) {
          const id = `snack-${idCounterRef.current++}`
          seenRef.current.add(txn.transactionId)
          additions.push({ id, transaction: txn, phase: 'entering' })
        }
      }

      if (additions.length === 0) return prev
      return [...prev, ...additions]
    })
  }, [newTransactions])

  // Phase transitions: entering → visible → exiting → removed
  useEffect(() => {
    for (const item of items) {
      if (item.phase === 'entering' && !timersRef.current.has(`enter-${item.id}`)) {
        const timer = setTimeout(() => {
          timersRef.current.delete(`enter-${item.id}`)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, phase: 'visible' } : i)),
          )
        }, 400)
        timersRef.current.set(`enter-${item.id}`, timer)
      } else if (item.phase === 'visible' && !timersRef.current.has(`vis-${item.id}`)) {
        const timer = setTimeout(() => {
          timersRef.current.delete(`vis-${item.id}`)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, phase: 'exiting' } : i)),
          )
          const exitTimer = setTimeout(() => {
            timersRef.current.delete(`exit-${item.id}`)
            setItems((prev) => prev.filter((i) => i.id !== item.id))
            onConsumed(item.transaction.transactionId)
          }, 350)
          timersRef.current.set(`exit-${item.id}`, exitTimer)
        }, 4000)
        timersRef.current.set(`vis-${item.id}`, timer)
      }
    }
  }, [items, onConsumed])

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="snackbar-container" aria-live="polite" aria-label="New transaction notifications">
      {items.map((item) => (
        <SnackbarEntry key={item.id} item={item} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SnackbarEntry
// ---------------------------------------------------------------------------

function SnackbarEntry({ item }: { item: SnackbarItem }) {
  const { transaction, phase } = item

  const amount = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(transaction.amount)

  return (
    <div className={`snackbar snackbar--${phase}`} role="status">
      <div className="snackbar__header">
        <span className="snackbar__icon" aria-hidden="true">✓</span>
        <span className="snackbar__title">NEW TRANSACTION</span>
      </div>
      <div className="snackbar__body">
        <span className="snackbar__id">{transaction.transactionId}</span>
        <span className="snackbar__dot" aria-hidden="true">•</span>
        <span className="snackbar__amount">${amount}</span>
      </div>
    </div>
  )
}

import { useCallback, useState } from 'react'
import SummaryCard from '../components/SummaryCard'
import TransactionsTable from '../components/TransactionsTable'
import SnackbarContainer from '../components/SnackbarContainer'
import { updateTransactionStatus } from '../api/transactionsApi'
import { useTransactions } from '../hooks/useTransactions'
import { summarizeTransactions } from '../data/summaries'
import type { Transaction, TransactionStatus } from '../types/transaction'

export default function Monitor() {
  const [newTransactions, setNewTransactions] = useState<Transaction[]>([])

  const handleNewTransaction = useCallback((txn: Transaction) => {
    setNewTransactions((prev) => [...prev, txn])
  }, [])

  const handleConsumed = useCallback((transactionId: string) => {
    setNewTransactions((prev) => prev.filter((t) => t.transactionId !== transactionId))
  }, [])

  const { transactions, setTransactions, isLoading, error, reload } = useTransactions(handleNewTransaction)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [animatingTransactionId, setAnimatingTransactionId] = useState<string | null>(null)

  async function handleUpdateStatus(
    transactionId: string,
    status: TransactionStatus,
  ) {
    setUpdateError(null)
    try {
      await updateTransactionStatus(transactionId, status)
      // Update the transaction optimistically
      setTransactions((prev) =>
        prev.map((txn) =>
          txn.transactionId === transactionId ? { ...txn, status } : txn,
        ),
      )
      // Trigger the animation
      setAnimatingTransactionId(transactionId)
    } catch (err) {
      setUpdateError(
        err instanceof Error ? err.message : 'Failed to update transaction.',
      )
    }
  }

  const handleAnimationEnd = useCallback(() => {
    setAnimatingTransactionId(null)
  }, [])

  return (
    <div className="dashboard">
      <header className="app-header">
        <div className="app-header__brand">Real-Time Financial Monitor</div>
        <h1 className="app-header__title">Monitor</h1>
      </header>

      {isLoading && (
        <div className="dashboard__status" role="status">
          Loading transactions…
        </div>
      )}

      {!isLoading && error && (
        <div
          className="dashboard__status dashboard__status--error"
          role="alert"
        >
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <section className="summary-grid" aria-label="Transaction summary">
            <SummaryCard
              label="Total Transactions"
              value={summarizeTransactions(transactions).total}
            />
            <SummaryCard
              label="Pending"
              value={summarizeTransactions(transactions).pending}
              accent="pending"
            />
            <SummaryCard
              label="Completed"
              value={summarizeTransactions(transactions).completed}
              accent="completed"
            />
            <SummaryCard
              label="Failed"
              value={summarizeTransactions(transactions).failed}
              accent="failed"
            />
          </section>

          {updateError && (
            <p className="monitor__update-error" role="alert">
              {updateError}
            </p>
          )}

          <TransactionsTable
            transactions={transactions}
            animatingTransactionId={animatingTransactionId}
            onUpdateStatus={handleUpdateStatus}
            onAnimationEnd={handleAnimationEnd}
          />

          <SnackbarContainer
            newTransactions={newTransactions}
            onConsumed={handleConsumed}
          />
        </>
      )}
    </div>
  )
}

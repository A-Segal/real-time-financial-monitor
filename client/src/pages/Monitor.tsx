import { useCallback, useMemo, useState } from 'react'
import SummaryCard from '../components/SummaryCard'
import TransactionsTable from '../components/TransactionsTable'
import StatusBadge from '../components/StatusBadge'
import SnackbarContainer from '../components/SnackbarContainer'
import { updateTransactionStatus } from '../api/transactionsApi'
import { useTransactions } from '../hooks/useTransactions'
import { summarizeTransactions } from '../data/summaries'
import type { Transaction, TransactionStatus } from '../types/transaction'

type StatusFilter = 'all' | TransactionStatus
type ViewMode = 'table' | 'dashboard'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Failed', label: 'Failed' },
]

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'dashboard', label: 'Dashboard' },
]

export default function Monitor() {
  const [newTransactions, setNewTransactions] = useState<Transaction[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('table')

  const handleNewTransaction = useCallback((txn: Transaction) => {
    setNewTransactions((prev) => [...prev, txn])
  }, [])

  const handleConsumed = useCallback((transactionId: string) => {
    setNewTransactions((prev) => prev.filter((t) => t.transactionId !== transactionId))
  }, [])

  const { transactions, setTransactions, isLoading, error, reload } = useTransactions(handleNewTransaction)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [animatingTransactionId, setAnimatingTransactionId] = useState<string | null>(null)

  const filteredTransactions = useMemo(() => {
    if (statusFilter === 'all') return transactions
    return transactions.filter((txn) => txn.status === statusFilter)
  }, [transactions, statusFilter])

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

  const summaries = useMemo(() => summarizeTransactions(transactions), [transactions])

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
              value={summaries.total}
            />
            <SummaryCard
              label="Pending"
              value={summaries.pending}
              accent="pending"
            />
            <SummaryCard
              label="Completed"
              value={summaries.completed}
              accent="completed"
            />
            <SummaryCard
              label="Failed"
              value={summaries.failed}
              accent="failed"
            />
          </section>

          {updateError && (
            <p className="monitor__update-error" role="alert">
              {updateError}
            </p>
          )}

          {/* ── Control bar: view switcher, filter ── */}
          <div className="monitor-controls">
            <div className="monitor-view-switcher" role="group" aria-label="View mode">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`monitor-view-btn${view === opt.value ? ' monitor-view-btn--active' : ''}`}
                  onClick={() => setView(opt.value)}
                  aria-pressed={view === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="monitor-filters">
              <label className="monitor-filters__label" htmlFor="status-filter">
                Filter:
              </label>
              <select
                id="status-filter"
                className="monitor-filters__select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                {FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {view === 'table' && (
            <TransactionsTable
              transactions={filteredTransactions}
              animatingTransactionId={animatingTransactionId}
              onUpdateStatus={handleUpdateStatus}
              onAnimationEnd={handleAnimationEnd}
            />
          )}

          {view === 'dashboard' && (
            <section className="dashboard-view" aria-label="Dashboard view">
              <div className="dashboard-view__cards">
                {filteredTransactions.map((txn) => (
                  <div className="dashboard-view__card" key={txn.transactionId}>
                    <div className="dashboard-view__card-id">{txn.transactionId}</div>
                    <div className="dashboard-view__card-amount">
                      {formatAmount(txn.amount)} {txn.currency}
                    </div>
                    <div className="dashboard-view__card-status">
                      <StatusBadge
                        status={txn.status}
                        animating={animatingTransactionId === txn.transactionId}
                        onAnimationEnd={handleAnimationEnd}
                      />
                    </div>
                  </div>
                ))}
                {filteredTransactions.length === 0 && (
                  <p className="dashboard-view__empty">No transactions found.</p>
                )}
              </div>
            </section>
          )}

          <SnackbarContainer
            newTransactions={newTransactions}
            onConsumed={handleConsumed}
          />
        </>
      )}
    </div>
  )
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

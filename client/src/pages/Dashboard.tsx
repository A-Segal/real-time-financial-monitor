import Header from '../components/Header'
import SummaryCard from '../components/SummaryCard'
import TransactionsTable from '../components/TransactionsTable'
import { useTransactions } from '../hooks/useTransactions'
import { summarizeTransactions } from '../data/summaries'

/**
 * Main dashboard view. Composes the header, summary cards, and transaction
 * table backed by data loaded from the API.
 */
export default function Dashboard() {
  const { transactions, isLoading, error, reload } = useTransactions()

  if (isLoading) {
    return (
      <div className="dashboard">
        <Header />
        <div className="dashboard__status" role="status">
          Loading transactions…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <Header />
        <div className="dashboard__status dashboard__status--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const totals = summarizeTransactions(transactions)

  return (
    <div className="dashboard">
      <Header />

      <section
        className="summary-grid"
        aria-label="Transaction summary"
      >
        <SummaryCard label="Total Transactions" value={totals.total} />
        <SummaryCard label="Pending" value={totals.pending} accent="pending" />
        <SummaryCard
          label="Completed"
          value={totals.completed}
          accent="completed"
        />
        <SummaryCard label="Failed" value={totals.failed} accent="failed" />
      </section>

      <TransactionsTable transactions={transactions} />
    </div>
  )
}

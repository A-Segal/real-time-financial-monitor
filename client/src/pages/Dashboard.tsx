import Header from '../components/Header'
import SummaryCard from '../components/SummaryCard'
import TransactionsTable from '../components/TransactionsTable'
import { mockTransactions, summarizeTransactions } from '../data/mockTransactions'

/**
 * Main dashboard view. Composes the header, summary cards, and transaction
 * table from the current (mock) data source.
 */
export default function Dashboard() {
  const totals = summarizeTransactions(mockTransactions)

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

      <TransactionsTable transactions={mockTransactions} />
    </div>
  )
}

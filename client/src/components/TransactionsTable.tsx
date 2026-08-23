import type { Transaction } from '../types/transaction'
import StatusBadge from './StatusBadge'

interface TransactionsTableProps {
  transactions: Transaction[]
}

/**
 * Formats an ISO timestamp into a compact, human-readable local string.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Renders the transaction list as a responsive table.
 */
export default function TransactionsTable({
  transactions,
}: TransactionsTableProps) {
  return (
    <section className="transactions" aria-labelledby="transactions-heading">
      <header className="transactions__header">
        <h2 id="transactions-heading">Recent Transactions</h2>
      </header>

      <div className="transactions__table-wrap">
        {transactions.length === 0 ? (
          <p className="transactions__empty">No transactions found.</p>
        ) : (
          <table className="transactions__table">
            <thead>
              <tr>
                <th scope="col">Transaction ID</th>
                <th scope="col">Amount</th>
                <th scope="col">Currency</th>
                <th scope="col">Status</th>
                <th scope="col">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.transactionId}>
                  <td className="transactions__id">{txn.transactionId}</td>
                  <td className="transactions__amount">
                    {formatAmount(txn.amount)}
                  </td>
                  <td>{txn.currency}</td>
                  <td>
                    <StatusBadge status={txn.status} />
                  </td>
                  <td className="transactions__timestamp">
                    {formatTimestamp(txn.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/**
 * Formats an amount with two decimals and the localized grouping separator.
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

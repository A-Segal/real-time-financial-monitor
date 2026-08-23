import type { Transaction, TransactionStatus } from '../types/transaction'
import StatusBadge from './StatusBadge'

interface TransactionsTableProps {
  transactions: Transaction[]
  onUpdateStatus?: (transactionId: string, status: TransactionStatus) => void
}

const STATUS_OPTIONS: TransactionStatus[] = ['Pending', 'Completed', 'Failed']

export default function TransactionsTable({
  transactions,
  onUpdateStatus,
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
                {onUpdateStatus &&
                  transactions.some((txn) => txn.status === 'Pending') && (
                    <th className="transactions__actions-head">Actions</th>
                  )}
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
                  {onUpdateStatus && txn.status === 'Pending' && (
                    <td className="transactions__actions">
                      <label className="transactions__status-picker">
                        <span className="visually-hidden">Update status</span>
                        <select
                          className="transactions__status-select"
                          value={txn.status}
                          onChange={(e) =>
                            onUpdateStatus(
                              txn.transactionId,
                              e.target.value as TransactionStatus,
                            )
                          }
                          aria-label={`Update status for ${txn.transactionId}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

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

function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

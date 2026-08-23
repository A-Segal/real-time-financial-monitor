import type { TransactionStatus } from '../types/transaction'

interface StatusBadgeProps {
  status: TransactionStatus
}

/**
 * Small colored badge that gives each transaction status a clear visual
 * identity. Colors/copy are the single source of truth for status styling.
 */
export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {status}
    </span>
  )
}

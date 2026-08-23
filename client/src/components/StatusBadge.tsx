import type { TransactionStatus } from '../types/transaction'

interface StatusBadgeProps {
  status: TransactionStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {status}
    </span>
  )
}

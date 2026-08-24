import { useEffect, useRef, useState } from 'react'
import type { TransactionStatus } from '../types/transaction'

interface StatusBadgeProps {
  status: TransactionStatus
  animating?: boolean
  onAnimationEnd?: () => void
}

const STATUS_ICONS: Record<TransactionStatus, string> = {
  Pending: '●',
  Completed: '✓',
  Failed: '✗',
}

export default function StatusBadge({ status, animating = false, onAnimationEnd }: StatusBadgeProps) {
  const [previousStatus, setPreviousStatus] = useState<TransactionStatus | null>(null)
  const prevRef = useRef<TransactionStatus>(status)

  useEffect(() => {
    if (prevRef.current !== status) {
      setPreviousStatus(prevRef.current)
      prevRef.current = status
    }
  }, [status])

  const icon = STATUS_ICONS[status]
  const className = [
    'status-badge',
    `status-badge--${status.toLowerCase()}`,
    animating ? 'status-badge--animating' : '',
    animating && previousStatus ? `status-badge--from-${previousStatus.toLowerCase()}` : '',
  ].filter(Boolean).join(' ')

  return (
    <span className={className} onAnimationEnd={onAnimationEnd}>
      <span className="status-badge__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="status-badge__label">{status}</span>
    </span>
  )
}

interface SummaryCardProps {
  label: string
  value: number
  accent?: 'default' | 'pending' | 'completed' | 'failed'
}

export default function SummaryCard({
  label,
  value,
  accent = 'default',
}: SummaryCardProps) {
  return (
    <article className={`summary-card summary-card--${accent}`}>
      <p className="summary-card__label">{label}</p>
      <p className="summary-card__value">{value}</p>
    </article>
  )
}

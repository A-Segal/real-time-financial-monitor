import type { AppRoute } from '../components/NavBar'

interface EntryProps {
  onNavigate: (route: AppRoute) => void
}

export default function Entry({ onNavigate }: EntryProps) {
  return (
    <div className="dashboard">
      <header className="app-header">
        <div className="app-header__brand">Real-Time Financial Monitor</div>
        <h1 className="app-header__title">Welcome</h1>
      </header>

      <p className="entry__intro">
        Monitor financial transactions in real time. Add a new transaction or
        watch the live dashboard as updates stream in.
      </p>

      <section className="entry__actions" aria-label="Available actions">
        <button
          type="button"
          className="entry__action"
          onClick={() => onNavigate('add')}
        >
          <span className="entry__action-title">Add Transaction</span>
          <span className="entry__action-text">
            Create a new transaction with an amount, currency and initial status.
          </span>
        </button>

        <button
          type="button"
          className="entry__action"
          onClick={() => onNavigate('monitor')}
        >
          <span className="entry__action-title">Monitor</span>
          <span className="entry__action-text">
            View summary totals and follow live status updates as they happen.
          </span>
        </button>
      </section>
    </div>
  )
}

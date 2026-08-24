import type { AppRoute } from '../components/NavBar'

interface EntryProps {
  onNavigate: (route: AppRoute) => void
}

export default function Entry({ onNavigate }: EntryProps) {
  return (
    <div className="home-page">
      <div className="home-hero">
        <img
          className="home-hero__icon"
          src="/money-bag.png"
          alt=""
          width="90"
          height="90"
        />

        <span className="home-hero__eyebrow">FINANCIAL SYSTEM</span>
        <h1 className="home-hero__title">Financial Monitor</h1>
        <p className="home-hero__subtitle">
          Real-time transaction monitoring
        </p>
      </div>

      <div className="home-cards">
        <button
          type="button"
          className="home-card home-card--monitor"
          onClick={() => onNavigate('monitor')}
        >
          <div className="home-card__icon-wrap home-card__icon-wrap--blue">
            <span className="home-card__icon" aria-hidden="true">↗</span>
          </div>
          <div className="home-card__body">
            <h2 className="home-card__title">MONITOR</h2>
            <p className="home-card__desc">
              View and monitor transactions in real time.
            </p>
          </div>
          <span className="home-card__arrow" aria-hidden="true">→</span>
        </button>

        <button
          type="button"
          className="home-card home-card--add"
          onClick={() => onNavigate('add')}
        >
          <div className="home-card__icon-wrap home-card__icon-wrap--green">
            <span className="home-card__icon" aria-hidden="true">+</span>
          </div>
          <div className="home-card__body">
            <h2 className="home-card__title">ADD TRANSACTION</h2>
            <p className="home-card__desc">
              Create and send a new transaction.
            </p>
          </div>
          <span className="home-card__arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <footer className="home-footer">
        REAL-TIME FINANCIAL MONITOR
      </footer>
    </div>
  )
}

export type AppRoute = 'entry' | 'add' | 'monitor'

interface NavBarProps {
  route: AppRoute
  onNavigate: (route: AppRoute) => void
}

const LINKS: Array<{ route: AppRoute; label: string }> = [
  { route: 'entry', label: 'Home' },
  { route: 'add', label: 'Add Transaction' },
  { route: 'monitor', label: 'Monitor' },
]

export default function NavBar({ route, onNavigate }: NavBarProps) {
  return (
    <nav className="navbar" aria-label="Main navigation">
      {LINKS.map(({ route: target, label }) => (
        <a
          key={target}
          className={`navbar__link${
            route === target ? ' navbar__link--active' : ''
          }`}
          href={`#/${target}`}
          onClick={() => onNavigate(target)}
          aria-current={route === target ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

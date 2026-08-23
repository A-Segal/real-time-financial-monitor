import { useCallback, useEffect, useState } from 'react'
import NavBar from './components/NavBar'
import type { AppRoute } from './components/NavBar'
import Entry from './pages/Entry'
import AddTransaction from './pages/AddTransaction'
import Monitor from './pages/Monitor'
import './App.css'

function routeFromHash(hash: string): AppRoute {
  if (hash.startsWith('#/add')) return 'add'
  if (hash.startsWith('#/monitor')) return 'monitor'
  return 'entry'
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    routeFromHash(window.location.hash),
  )

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next)
  }, [])

  useEffect(() => {
    function handleHashChange() {
      setRoute(routeFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="app">
      <NavBar route={route} onNavigate={navigate} />
      {route === 'entry' && <Entry onNavigate={navigate} />}
      {route === 'add' && <AddTransaction onCreated={() => navigate('monitor')} />}
      {route === 'monitor' && <Monitor />}
    </div>
  )
}

export default App

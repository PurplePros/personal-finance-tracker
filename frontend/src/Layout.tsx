import { NavLink, Outlet } from 'react-router-dom'
import { useAccounts } from './accounts/AccountsContext'
import { useSpending } from './spending/SpendingContext'

export default function Layout() {
  const { isRefreshing, isAddingAccount, status, error, refresh, addAccount } = useAccounts()
  const { refresh: refreshSpending } = useSpending()

  async function handleRefresh() {
    await refresh()
    await refreshSpending()
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-brand">Guru</span>
        <div className="header-actions">
          <button disabled={isRefreshing} onClick={() => void handleRefresh()} type="button">
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            disabled={isAddingAccount || isRefreshing}
            onClick={() => void addAccount()}
            type="button"
          >
            {isAddingAccount ? 'Connecting…' : 'Add account'}
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Views">
        <NavLink className="nav-tab" to="/accounts">Accounts</NavLink>
        <NavLink className="nav-tab" to="/spending">Spending</NavLink>
      </nav>

      <main className="app-shell">
        <Outlet />
      </main>

      <footer className="app-footer">
        <p className="status" role="status">{error ?? status}</p>
        {error && (
          <button className="try-again" onClick={() => void handleRefresh()} type="button">
            Try again
          </button>
        )}
      </footer>
    </div>
  )
}

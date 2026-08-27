import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDashboardData, syncAccounts } from './api/client'
import { deriveDashboard, type AccountView, type DashboardViewModel } from './dashboard/deriveDashboard'

const REFRESH_INTERVAL_MS = 10 * 60 * 1000
const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

function formatBalance(balance: number) {
  return currency.format(balance / 100)
}

function Balance({
  balance,
  className,
  as: Tag = 'strong',
}: {
  balance: number
  className?: string
  as?: 'p' | 'strong'
}) {
  const isLiability = balance < 0
  return (
    <Tag className={[className, isLiability ? 'liability' : 'asset'].filter(Boolean).join(' ')}>
      {isLiability ? `−${formatBalance(-balance)}` : formatBalance(balance)}
    </Tag>
  )
}

function AccountRow({ account }: { account: AccountView }) {
  return (
    <li className="account-row">
      <span>{account.name}</span>
      <Balance balance={account.balance} />
    </li>
  )
}

function Dashboard({ model }: { model: DashboardViewModel }) {
  return (
    <section className="institutions" aria-label="Accounts by institution">
      {model.institutions.map((institution) => (
        <article className="institution" key={institution.id}>
          <header className="institution-header">
            <h2>{institution.name}</h2>
            <Balance balance={institution.subtotal} />
          </header>

          {institution.accounts.length > 0 && (
            <ul className="account-list">
              {institution.accounts.map((account) => (
                <AccountRow account={account} key={account.id} />
              ))}
            </ul>
          )}

          {institution.investments.length > 0 && (
            <section className="investments" aria-label={`${institution.name} investments`}>
              <p>Investments</p>
              {institution.investments.map((product) => (
                <div className="investment-product" key={product.productName}>
                  <div className="product-header">
                    <h3>{product.productName}</h3>
                    <Balance balance={product.subtotal} />
                  </div>
                  <ul className="account-list">
                    {product.accounts.map((account) => (
                      <AccountRow account={account} key={account.id} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </article>
      ))}
    </section>
  )
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardViewModel | null>(null)
  const [message, setMessage] = useState('Loading accounts…')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const syncInFlight = useRef<Promise<DashboardViewModel> | null>(null)

  const load = useCallback(async () => {
    const data = await fetchDashboardData()
    return deriveDashboard(data.institutions, data.accounts)
  }, [])

  const synchronize = useCallback(() => {
    if (syncInFlight.current) return syncInFlight.current

    const request = (async () => {
      await syncAccounts()
      return load()
    })()
    syncInFlight.current = request
    const clearInFlight = () => {
      if (syncInFlight.current === request) syncInFlight.current = null
    }
    void request.then(clearInFlight, clearInFlight)
    return request
  }, [load])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    setMessage('Syncing accounts…')
    try {
      setDashboard(await synchronize())
      setMessage(`Updated ${new Intl.DateTimeFormat('en-CA', { timeStyle: 'short' }).format(new Date())}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to refresh accounts.')
    } finally {
      setIsRefreshing(false)
    }
  }, [synchronize])

  useEffect(() => {
    let isCurrent = true

    async function initialize() {
      try {
        const data = await fetchDashboardData()
        if (data.accounts.length === 0) {
          setMessage('Finding your accounts…')
          const dashboard = await synchronize()
          if (!isCurrent) return
          setDashboard(dashboard)
        } else {
          setDashboard(deriveDashboard(data.institutions, data.accounts))
        }
        if (isCurrent) setMessage(`Updated ${new Intl.DateTimeFormat('en-CA', { timeStyle: 'short' }).format(new Date())}`)
      } catch (cause) {
        if (isCurrent) setError(cause instanceof Error ? cause.message : 'Unable to load accounts.')
      }
    }

    void initialize()
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => {
      isCurrent = false
      window.clearInterval(interval)
    }
  }, [refresh, synchronize])

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Guru</p>
            <h1>Your financial position</h1>
          </div>
          <button disabled={isRefreshing} onClick={() => void refresh()} type="button">
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {dashboard && (
          <>
            <p className="net-worth-label">Net worth</p>
            <Balance as="p" balance={dashboard.netWorth} className="net-worth" />
            <dl className="totals">
              <div><dt>Assets</dt><dd>{formatBalance(dashboard.totalAssets)}</dd></div>
              <div><dt>Liabilities</dt><dd>{formatBalance(dashboard.totalLiabilities)}</dd></div>
            </dl>
          </>
        )}
      </header>

      <p className="status" role="status">{error ?? message}</p>
      {error && <button className="try-again" onClick={() => void refresh()} type="button">Try again</button>}
      {dashboard && (dashboard.institutions.length > 0 ? <Dashboard model={dashboard} /> : <p className="empty-state">No Canadian accounts to show yet.</p>)}
    </main>
  )
}

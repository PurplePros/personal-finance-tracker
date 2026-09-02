import { useCallback, useEffect, useRef, useState } from 'react'
import { createLinkToken, exchangeToken, fetchDashboardData, syncAccounts } from './api/client'
import type { Institution, SyncResult } from './api/types'
import { deriveDashboard, type AccountView, type DashboardViewModel } from './dashboard/deriveDashboard'

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidConfig) => { open: () => void; destroy: () => void }
    }
  }
}

interface PlaidConfig {
  token: string
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void
  onExit?: () => void
}

interface PlaidMetadata {
  institution?: { name: string }
}

const REFRESH_INTERVAL_MS = 10 * 60 * 1000
const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
const timeFormat = new Intl.DateTimeFormat('en-CA', { timeStyle: 'short' })

function formatBalance(balance: number) {
  return currency.format(balance / 100)
}

function nowFormatted() {
  return `Updated ${timeFormat.format(new Date())}`
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

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Plaid Link SDK'))
    document.head.appendChild(script)
  })
}

function openPlaidLink(
  token: string,
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void,
  onExit: () => void,
): void {
  if (!window.Plaid) throw new Error('Plaid SDK not loaded')
  const handler = window.Plaid.create({
    token,
    onSuccess: (publicToken, metadata) => {
      handler.destroy()
      onSuccess(publicToken, metadata)
    },
    onExit: () => {
      handler.destroy()
      onExit()
    },
  })
  handler.open()
}

type SyncOutcome = {
  dashboard: DashboardViewModel
  institutions: Institution[]
  results: SyncResult[]
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardViewModel | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [message, setMessage] = useState('Loading accounts…')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [reconnectErrors, setReconnectErrors] = useState<SyncResult[]>([])
  const syncInFlight = useRef<Promise<SyncOutcome> | null>(null)

  const synchronize = useCallback(() => {
    if (syncInFlight.current) return syncInFlight.current

    const request = (async (): Promise<SyncOutcome> => {
      const results = await syncAccounts()
      const data = await fetchDashboardData()
      return {
        dashboard: deriveDashboard(data.institutions, data.accounts),
        institutions: data.institutions,
        results,
      }
    })()
    syncInFlight.current = request
    const clearInFlight = () => {
      if (syncInFlight.current === request) syncInFlight.current = null
    }
    void request.then(clearInFlight, clearInFlight)
    return request
  }, [])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    setMessage('Syncing accounts…')
    try {
      const { dashboard: newDashboard, institutions: newInstitutions, results } = await synchronize()
      setDashboard(newDashboard)
      setInstitutions(newInstitutions)
      setReconnectErrors(results.filter((r) => r.error_code === 'ITEM_LOGIN_REQUIRED'))
      setMessage(nowFormatted())
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
        if (!isCurrent) return
        setInstitutions(data.institutions)
        if (data.accounts.length === 0) {
          setMessage('Finding your accounts…')
          const { dashboard: newDashboard, institutions: newInstitutions, results } = await synchronize()
          if (!isCurrent) return
          setDashboard(newDashboard)
          setInstitutions(newInstitutions)
          setReconnectErrors(results.filter((r) => r.error_code === 'ITEM_LOGIN_REQUIRED'))
        } else {
          setDashboard(deriveDashboard(data.institutions, data.accounts))
        }
        if (isCurrent) setMessage(nowFormatted())
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

  const handleAddAccount = useCallback(async () => {
    setIsAddingAccount(true)
    setError(null)
    try {
      await loadPlaidScript()
      const linkToken = await createLinkToken()
      await new Promise<void>((resolve, reject) => {
        openPlaidLink(
          linkToken,
          async (publicToken, metadata) => {
            try {
              const institutionName = metadata.institution?.name ?? 'Unknown Institution'
              await exchangeToken(publicToken, institutionName)
              await refresh()
              resolve()
            } catch (cause) {
              reject(cause instanceof Error ? cause : new Error('Failed to connect account'))
            }
          },
          resolve, // user cancelled: resolve without error so no error banner appears
        )
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to add account.')
    } finally {
      setIsAddingAccount(false)
    }
  }, [refresh])

  const handleReconnect = useCallback(async (opts: { itemId?: string; institutionId?: string }) => {
    setError(null)
    try {
      await loadPlaidScript()
      const linkToken = await createLinkToken(opts)
      await new Promise<void>((resolve, reject) => {
        openPlaidLink(
          linkToken,
          async () => {
            try {
              await refresh()
              resolve()
            } catch (cause) {
              reject(cause instanceof Error ? cause : new Error('Failed to reconnect'))
            }
          },
          resolve, // user cancelled: resolve silently
        )
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to reconnect account.')
    }
  }, [refresh])

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Guru</p>
            <h1>Your financial position</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button disabled={isRefreshing} onClick={() => void refresh()} type="button">
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              disabled={isAddingAccount || isRefreshing}
              onClick={() => void handleAddAccount()}
              type="button"
            >
              {isAddingAccount ? 'Connecting…' : 'Add account'}
            </button>
          </div>
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

      {reconnectErrors.length > 0 && (
        <div className="reconnect-prompts">
          {reconnectErrors.map((r) => {
            const institution = institutions.find((i) => i.id === r.institution_id)
            const reconnectOpts = institution
              ? institution.plaid_item_id
                ? { itemId: institution.plaid_item_id }
                : { institutionId: institution.id }
              : null
            return (
              <div className="reconnect-prompt" key={r.institution_id ?? r.institution}>
                <span>{r.institution} needs to be reconnected.</span>
                {reconnectOpts && (
                  <button
                    onClick={() => void handleReconnect(reconnectOpts)}
                    type="button"
                  >
                    Reconnect {r.institution}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dashboard && (dashboard.institutions.length > 0 ? <Dashboard model={dashboard} /> : <p className="empty-state">No Canadian accounts to show yet.</p>)}
    </main>
  )
}

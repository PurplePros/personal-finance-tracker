import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createLinkToken, exchangeToken, fetchDashboardData, syncAccounts } from '../api/client'
import type { Institution, SyncResult } from '../api/types'
import { deriveDashboard, type DashboardViewModel } from '../dashboard/deriveDashboard'
import { createOrchestrator, selectReconnectPrompts } from '../dashboard/orchestrate'

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

const timeFormat = new Intl.DateTimeFormat('en-CA', { timeStyle: 'short' })

function nowFormatted() {
  return `Updated ${timeFormat.format(new Date())}`
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

const REFRESH_INTERVAL_MS = 10 * 60 * 1000

export interface AccountsContextValue {
  dashboard: DashboardViewModel | null
  institutions: Institution[]
  reconnectPrompts: SyncResult[]
  status: string
  error: string | null
  isRefreshing: boolean
  isAddingAccount: boolean
  isReconnecting: boolean
  refresh: () => Promise<void>
  addAccount: () => Promise<void>
  reconnect: (opts: { itemId?: string; institutionId?: string }) => Promise<void>
}

const AccountsContext = createContext<AccountsContextValue | null>(null)

export function useAccounts(): AccountsContextValue {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccounts must be used inside AccountsProvider')
  return ctx
}

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardViewModel | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [status, setStatus] = useState('Loading accounts…')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [reconnectPrompts, setReconnectPrompts] = useState<SyncResult[]>([])

  const orchestratorRef = useRef(
    createOrchestrator(syncAccounts, fetchDashboardData, deriveDashboard),
  )

  const applyOutcome = useCallback(
    (outcome: { dashboard: DashboardViewModel; institutions: Institution[]; results: SyncResult[] }) => {
      setDashboard(outcome.dashboard)
      setInstitutions(outcome.institutions)
      setReconnectPrompts(selectReconnectPrompts(outcome.results))
      setStatus(nowFormatted())
    },
    [],
  )

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    setStatus('Syncing accounts…')
    try {
      applyOutcome(await orchestratorRef.current.run())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to refresh accounts.')
    } finally {
      setIsRefreshing(false)
    }
  }, [applyOutcome])

  useEffect(() => {
    let isCurrent = true

    async function initialize() {
      try {
        const data = await fetchDashboardData()
        if (!isCurrent) return
        setInstitutions(data.institutions)
        if (data.accounts.length === 0) {
          setStatus('Finding your accounts…')
          const outcome = await orchestratorRef.current.run()
          if (!isCurrent) return
          applyOutcome(outcome)
        } else {
          setDashboard(deriveDashboard(data.institutions, data.accounts))
          setStatus(nowFormatted())
        }
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
  }, [applyOutcome, refresh])

  const addAccount = useCallback(async () => {
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
          resolve, // user cancelled: resolve silently
        )
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to add account.')
    } finally {
      setIsAddingAccount(false)
    }
  }, [refresh])

  const reconnect = useCallback(
    async (opts: { itemId?: string; institutionId?: string }) => {
      setIsReconnecting(true)
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
      } finally {
        setIsReconnecting(false)
      }
    },
    [refresh],
  )

  return (
    <AccountsContext value={{
      dashboard,
      institutions,
      reconnectPrompts,
      status,
      error,
      isRefreshing,
      isAddingAccount,
      isReconnecting,
      refresh,
      addAccount,
      reconnect,
    }}>
      {children}
    </AccountsContext>
  )
}

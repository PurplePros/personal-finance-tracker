/**
 * Pure sync orchestration: single-flight dedup and reconnect prompt selection.
 * Takes data-access functions as inputs so it can be exercised without a browser or network.
 */
import type { Account, Institution, SyncResult } from '../api/types'
import type { DashboardViewModel } from './deriveDashboard'

export type SyncOutcome = {
  dashboard: DashboardViewModel
  institutions: Institution[]
  results: SyncResult[]
}

type SyncFn = () => Promise<SyncResult[]>
type FetchFn = () => Promise<{ institutions: Institution[]; accounts: Account[] }>
type DeriveFn = (institutions: Institution[], accounts: Account[]) => DashboardViewModel

/** Selects only the sync results that require re-authentication. */
export function selectReconnectPrompts(results: SyncResult[]): SyncResult[] {
  return results.filter((r) => r.error_code === 'ITEM_LOGIN_REQUIRED')
}

/**
 * Returns an orchestrator whose `run()` method wraps the sync-fetch-derive sequence
 * with single-flight dedup: concurrent callers share one in-flight run.
 */
export function createOrchestrator(sync: SyncFn, fetch: FetchFn, derive: DeriveFn) {
  let inFlight: Promise<SyncOutcome> | null = null

  function run(): Promise<SyncOutcome> {
    if (inFlight) return inFlight

    const request = (async (): Promise<SyncOutcome> => {
      const results = await sync()
      const data = await fetch()
      return {
        dashboard: derive(data.institutions, data.accounts),
        institutions: data.institutions,
        results,
      }
    })()

    inFlight = request
    const clearInFlight = () => {
      if (inFlight === request) inFlight = null
    }
    void request.then(clearInFlight, clearInFlight)
    return request
  }

  return { run }
}

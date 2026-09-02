import { describe, expect, it, vi } from 'vitest'
import type { SyncResult } from '../api/types'
import { createOrchestrator, selectReconnectPrompts } from './orchestrate'

const emptyDashboard = { totalAssets: 0, totalLiabilities: 0, netWorth: 0, institutions: [] }

describe('selectReconnectPrompts', () => {
  it('returns only ITEM_LOGIN_REQUIRED results', () => {
    const results: SyncResult[] = [
      { institution: 'A', status: 'ok' },
      { institution: 'B', status: 'error', error_code: 'ITEM_LOGIN_REQUIRED' },
      { institution: 'C', status: 'error', error_code: 'OTHER_ERROR' },
      { institution: 'D', status: 'error' },
    ]
    expect(selectReconnectPrompts(results)).toEqual([results[1]])
  })

  it('returns empty when no results match', () => {
    const results: SyncResult[] = [
      { institution: 'A', status: 'ok' },
      { institution: 'B', status: 'error', error_code: 'SOME_ERROR' },
    ]
    expect(selectReconnectPrompts(results)).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(selectReconnectPrompts([])).toEqual([])
  })
})

describe('createOrchestrator', () => {
  describe('single-flight dedup', () => {
    it('triggers underlying sync only once for concurrent runs and returns the same outcome to both callers', async () => {
      let resolveSync!: () => void
      const syncBlocker = new Promise<void>((r) => {
        resolveSync = r
      })
      const sync = vi.fn(async () => {
        await syncBlocker
        return []
      })
      const fetch = vi.fn(async () => ({ institutions: [], accounts: [] }))
      const derive = vi.fn(() => emptyDashboard)

      const { run } = createOrchestrator(sync, fetch, derive)

      const p1 = run()
      const p2 = run()

      resolveSync()
      const [r1, r2] = await Promise.all([p1, p2])

      expect(sync).toHaveBeenCalledTimes(1)
      expect(r1).toBe(r2)
    })

    it('triggers a new sync after the first settles', async () => {
      const sync = vi.fn(async () => [])
      const fetch = vi.fn(async () => ({ institutions: [], accounts: [] }))
      const derive = vi.fn(() => emptyDashboard)

      const { run } = createOrchestrator(sync, fetch, derive)

      await run()
      await run()

      expect(sync).toHaveBeenCalledTimes(2)
    })
  })
})

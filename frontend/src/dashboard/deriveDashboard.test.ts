import { describe, expect, it } from 'vitest'
import type { Account, Institution } from '../api/types'
import { deriveDashboard, type DashboardViewModel } from './deriveDashboard'
import { accounts, institutions, TANGERINE, WEALTHSIMPLE } from './fixtures'

/** Every account in the view model, across institutions and investment groups. */
function allAccountsOf(model: DashboardViewModel) {
  return model.institutions.flatMap((inst) => [
    ...inst.accounts,
    ...inst.investments.flatMap((g) => g.accounts),
  ])
}

describe('deriveDashboard', () => {
  describe('the reference fixture (Wealthsimple + Tangerine)', () => {
    const model = deriveDashboard(institutions, accounts)

    it('classifies each account by the sign of its balance, incl. edge cases', () => {
      const byId = new Map(allAccountsOf(model).map((a) => [a.id, a]))

      expect(byId.get('acc-cc')?.classification).toBe('asset')
      expect(byId.get('acc-chq')?.classification).toBe('liability')
      expect(byId.get('acc-sav')?.classification).toBe('asset')
      expect(byId.get('acc-rrsp')?.classification).toBe('asset')
    })

    it('excludes non-CAD accounts from the grouped list', () => {
      const allIds = allAccountsOf(model).map((a) => a.id)
      expect(allIds).not.toContain('acc-usd')
    })

    it('computes total assets, total liabilities, and net worth', () => {
      expect(model.totalAssets).toBe(1_675_000)
      expect(model.totalLiabilities).toBe(12_000)
      expect(model.netWorth).toBe(1_663_000)
    })

    it('excludes non-CAD balances from the totals', () => {
      // The excluded USD account holds 1_000_000; if it leaked in, this would be higher.
      expect(model.totalAssets).toBe(1_675_000)
    })

    it('groups accounts by institution, in input order', () => {
      expect(model.institutions.map((i) => i.name)).toEqual([
        'Wealthsimple',
        'Tangerine',
      ])
      expect(model.institutions.map((i) => i.id)).toEqual([
        WEALTHSIMPLE.id,
        TANGERINE.id,
      ])
    })

    it('gives each institution a subtotal of its included signed balances', () => {
      const ws = model.institutions.find((i) => i.id === WEALTHSIMPLE.id)!
      const tg = model.institutions.find((i) => i.id === TANGERINE.id)!
      expect(ws.subtotal).toBe(875_000)
      expect(tg.subtotal).toBe(788_000)
      expect(ws.subtotal + tg.subtotal).toBe(model.netWorth)
    })

    it('keeps only non-investment accounts in the institution accounts list', () => {
      const ws = model.institutions.find((i) => i.id === WEALTHSIMPLE.id)!
      expect(ws.accounts.map((a) => a.id)).toEqual(['acc-cc'])

      const tg = model.institutions.find((i) => i.id === TANGERINE.id)!
      expect(tg.accounts.map((a) => a.id)).toEqual(['acc-chq', 'acc-sav'])
    })

    it('sub-groups Investment accounts by product name, keeping two TFSAs distinct', () => {
      const ws = model.institutions.find((i) => i.id === WEALTHSIMPLE.id)!
      expect(ws.investments.map((g) => g.productName)).toEqual(['RRSP', 'TFSA'])

      const rrsp = ws.investments.find((g) => g.productName === 'RRSP')!
      expect(rrsp.accounts.map((a) => a.id)).toEqual(['acc-rrsp'])
      expect(rrsp.subtotal).toBe(500_000)

      const tfsa = ws.investments.find((g) => g.productName === 'TFSA')!
      expect(tfsa.accounts.map((a) => a.id)).toEqual(['acc-tfsa-1', 'acc-tfsa-2'])
      expect(tfsa.subtotal).toBe(350_000)
    })

    it('leaves investments empty for an institution with none', () => {
      const tg = model.institutions.find((i) => i.id === TANGERINE.id)!
      expect(tg.investments).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('returns zeroed totals and no institutions for empty input', () => {
      const model = deriveDashboard([], [])
      expect(model).toEqual({
        totalAssets: 0,
        totalLiabilities: 0,
        netWorth: 0,
        institutions: [],
      })
    })

    it('omits an institution whose only accounts are non-CAD', () => {
      const inst: Institution = {
        id: 'inst-usd-only',
        name: 'Wealthsimple',
        plaid_id: 'p',
        plaid_item_id: null,
        holder: 'Catherine',
      }
      const usdAccount: Account = {
        id: 'a1',
        name: 'USD Cash',
        institution_id: inst.id,
        plaid_id: 'pa',
        type: 'Savings',
        balance: 500_000,
        iso_currency_code: 'USD',
      }
      const model = deriveDashboard([inst], [usdAccount])
      expect(model.institutions).toEqual([])
      expect(model.netWorth).toBe(0)
    })

    it('yields a negative net worth when liabilities exceed assets', () => {
      const inst: Institution = {
        id: 'inst-debt',
        name: 'Tangerine',
        plaid_id: 'p',
        plaid_item_id: null,
        holder: 'Catherine',
      }
      const asset: Account = {
        id: 'a-asset',
        name: 'Savings Account',
        institution_id: inst.id,
        plaid_id: 'pa',
        type: 'Savings',
        balance: 100_000,
        iso_currency_code: 'CAD',
      }
      const debt: Account = {
        id: 'a-debt',
        name: 'Line of Credit',
        institution_id: inst.id,
        plaid_id: 'pb',
        type: 'Credit Card',
        balance: -350_000,
        iso_currency_code: 'CAD',
      }
      const model = deriveDashboard([inst], [asset, debt])
      expect(model.totalAssets).toBe(100_000)
      expect(model.totalLiabilities).toBe(350_000)
      expect(model.netWorth).toBe(-250_000)
    })

    it('classifies a zero balance as an asset contributing nothing', () => {
      const inst: Institution = {
        id: 'inst-zero',
        name: 'Tangerine',
        plaid_id: 'p',
        plaid_item_id: null,
        holder: 'Catherine',
      }
      const zeroAccount: Account = {
        id: 'a0',
        name: 'Empty Chequing',
        institution_id: inst.id,
        plaid_id: 'pa',
        type: 'Chequing',
        balance: 0,
        iso_currency_code: 'CAD',
      }
      const model = deriveDashboard([inst], [zeroAccount])
      expect(model.institutions[0].accounts[0].classification).toBe('asset')
      expect(model.totalAssets).toBe(0)
      expect(model.totalLiabilities).toBe(0)
      expect(model.netWorth).toBe(0)
    })

    it('excludes accounts referencing an unknown institution', () => {
      const orphan: Account = {
        id: 'orphan',
        name: 'Ghost',
        institution_id: 'does-not-exist',
        plaid_id: 'pa',
        type: 'Savings',
        balance: 999_999,
        iso_currency_code: 'CAD',
      }
      const model = deriveDashboard(institutions, [...accounts, orphan])
      expect(model.netWorth).toBe(1_663_000)
    })
  })
})

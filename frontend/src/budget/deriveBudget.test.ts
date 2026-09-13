import { describe, expect, it } from 'vitest'
import { deriveBudget } from './deriveBudget'
import type { BudgetPlanEntry, Transaction } from '../api/types'

const MONTH = '2026-09'

function txn(overrides: Partial<Transaction> & { account_id: string; amount: number; major: string; subcategory?: string | null; date?: string }): Transaction {
  return {
    id: `txn-${Math.random()}`,
    account_id: overrides.account_id,
    date: overrides.date ?? `${MONTH}-05`,
    name: 'Test',
    merchant_name: null,
    amount: overrides.amount,
    pending: false,
    category: {
      major: overrides.major,
      subcategory: overrides.subcategory ?? 'Other',
    },
    category_source: 'plaid',
    is_spending: overrides.is_spending ?? true,
    note: null,
    ...overrides,
  }
}

const NO_PLAN: BudgetPlanEntry[] = []
const EQUAL_SPLIT = { catherine: 0.5, jade: 0.5 }
const HOLDERS: Record<string, string> = { 'acc-catherine': 'Catherine', 'acc-jade': 'Jade' }

describe('deriveBudget', () => {
  describe('planned amount resolution', () => {
    it('uses template when no month override exists', () => {
      const plan: BudgetPlanEntry[] = [{ major: 'Housing', month: null, planned_cents: 200000 }]
      const { rows } = deriveBudget([], plan, EQUAL_SPLIT, {}, MONTH)
      const housing = rows.find((r) => r.major === 'Housing')!
      expect(housing.planned_cents).toBe(200000)
    })

    it('uses month override when one exists for the selected month', () => {
      const plan: BudgetPlanEntry[] = [
        { major: 'Housing', month: null, planned_cents: 200000 },
        { major: 'Housing', month: MONTH, planned_cents: 180000 },
      ]
      const { rows } = deriveBudget([], plan, EQUAL_SPLIT, {}, MONTH)
      const housing = rows.find((r) => r.major === 'Housing')!
      expect(housing.planned_cents).toBe(180000)
    })

    it('uses template for a different month even when an override exists for another month', () => {
      const plan: BudgetPlanEntry[] = [
        { major: 'Housing', month: null, planned_cents: 200000 },
        { major: 'Housing', month: '2026-10', planned_cents: 180000 },
      ]
      const { rows } = deriveBudget([], plan, EQUAL_SPLIT, {}, MONTH)
      const housing = rows.find((r) => r.major === 'Housing')!
      expect(housing.planned_cents).toBe(200000)
    })

    it('defaults to 0 when no plan entry exists', () => {
      const { rows } = deriveBudget([], NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      for (const row of rows) {
        expect(row.planned_cents).toBe(0)
      }
    })
  })

  describe('actual spending', () => {
    it('sums spending transactions in the selected month for the correct major', () => {
      const transactions = [
        txn({ account_id: 'acc-1', amount: 8000, major: 'Food and personal items', subcategory: 'Groceries and personal items' }),
        txn({ account_id: 'acc-1', amount: 4000, major: 'Food and personal items', subcategory: 'Restaurants' }),
      ]
      const { rows } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      const food = rows.find((r) => r.major === 'Food and personal items')!
      expect(food.actual_cents).toBe(12000)
    })

    it('excludes transactions outside the selected month', () => {
      const transactions = [
        txn({ account_id: 'acc-1', amount: 8000, major: 'Food and personal items', date: '2026-08-05' }),
        txn({ account_id: 'acc-1', amount: 4000, major: 'Food and personal items', date: MONTH + '-10' }),
      ]
      const { rows } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      const food = rows.find((r) => r.major === 'Food and personal items')!
      expect(food.actual_cents).toBe(4000)
    })

    it('excludes non-spending transactions', () => {
      const transactions = [
        txn({ account_id: 'acc-1', amount: 100000, major: 'Finances', subcategory: 'Transfers', is_spending: false }),
      ]
      const { rows } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      // Finances is excluded from rows entirely, but also nothing should inflate other rows
      const total = rows.reduce((s, r) => s + r.actual_cents, 0)
      expect(total).toBe(0)
    })
  })

  describe('row ordering and Finances exclusion', () => {
    it('Finances major is absent from rows', () => {
      const { rows } = deriveBudget([], NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      expect(rows.find((r) => r.major === 'Finances')).toBeUndefined()
    })

    it('rows appear in taxonomy declaration order', () => {
      const { rows } = deriveBudget([], NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      expect(rows[0].major).toBe('Food and personal items')
      expect(rows[1].major).toBe('Shopping')
      expect(rows[rows.length - 1].major).toBe('Miscellaneous')
    })
  })

  describe('settlement', () => {
    it('net is zero when there are no spending transactions', () => {
      const { settlement } = deriveBudget([], NO_PLAN, EQUAL_SPLIT, {}, MONTH)
      expect(settlement.net_cents).toBe(0)
    })

    it('net is zero when neither holder has spending', () => {
      // Only non-spending transaction
      const transactions = [
        txn({ account_id: 'acc-catherine', amount: 100000, major: 'Finances', subcategory: 'Transfers', is_spending: false }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(0)
    })

    it('positive net when Catherine paid more than her share (Jade owes Catherine)', () => {
      // Catherine paid 10000; 50/50 split -> Jade owes Catherine 5000
      const transactions = [
        txn({ account_id: 'acc-catherine', amount: 10000, major: 'Food and personal items' }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(5000)
    })

    it('negative net when Jade paid more than her share (Catherine owes Jade)', () => {
      // Jade paid 10000; 50/50 split -> Catherine owes Jade 5000
      const transactions = [
        txn({ account_id: 'acc-jade', amount: 10000, major: 'Food and personal items' }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(-5000)
    })

    it('accounts not in holderByAccountId do not affect settlement', () => {
      const transactions = [
        txn({ account_id: 'acc-unknown', amount: 10000, major: 'Food and personal items' }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(0)
    })

    it('uses correct ratios for non-equal splits', () => {
      // Catherine_ratio = 0.6, jade_ratio = 0.4
      // Catherine paid 10000 -> jade_owes_catherine = 0.4 * 10000 = 4000
      const ratio = { catherine: 0.6, jade: 0.4 }
      const transactions = [
        txn({ account_id: 'acc-catherine', amount: 10000, major: 'Food and personal items' }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, ratio, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(4000)
    })

    it('netting: both holders paid, computes correct net', () => {
      // Catherine paid 20000, Jade paid 10000; 50/50 split
      // jade_owes_catherine = 0.5 * 20000 = 10000
      // catherine_owes_jade = 0.5 * 10000 = 5000
      // net = 10000 - 5000 = 5000
      const transactions = [
        txn({ account_id: 'acc-catherine', amount: 20000, major: 'Food and personal items' }),
        txn({ account_id: 'acc-jade', amount: 10000, major: 'Shopping' }),
      ]
      const { settlement } = deriveBudget(transactions, NO_PLAN, EQUAL_SPLIT, HOLDERS, MONTH)
      expect(settlement.net_cents).toBe(5000)
    })
  })
})

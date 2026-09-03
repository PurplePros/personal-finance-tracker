import { describe, expect, it } from 'vitest'
import { deriveSpending } from './deriveSpending'
import type { Transaction } from '../api/types'
import {
  SELECTED_MONTH,
  transactions,
  SEP_GROCERIES,
  SEP_RESTAURANT,
  SEP_CLOTHING,
  SEP_REFUND,
  SEP_TRANSFER,
  AUG_GROCERIES,
  OCT_GROCERIES,
} from './fixtures'

describe('deriveSpending', () => {
  describe('month filter', () => {
    it('includes only transactions in the selected month', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allDates = model.dayGroupedList.flatMap((g) => g.transactions.map((t) => t.date))
      for (const date of allDates) {
        expect(date.startsWith('2026-09')).toBe(true)
      }
    })

    it('excludes transactions from other months (past and future)', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allIds = model.dayGroupedList.flatMap((g) => g.transactions.map((t) => t.id))
      expect(allIds).not.toContain(OCT_GROCERIES.id)
      expect(allIds).not.toContain(AUG_GROCERIES.id)
    })
  })

  describe('net total', () => {
    it('sums only is_spending transactions and nets refunds', () => {
      // Sep spending: 8500 + 6000 + 25000 - 5000 = 34500
      const model = deriveSpending(transactions, SELECTED_MONTH)
      expect(model.netTotal).toBe(34_500)
    })

    it('excludes transfers (is_spending: false) from net total', () => {
      const withTransferOnly: Transaction[] = [SEP_TRANSFER]
      const model = deriveSpending(withTransferOnly, SELECTED_MONTH)
      expect(model.netTotal).toBe(0)
    })

    it('yields a negative net total when refunds exceed spending', () => {
      const txns: Transaction[] = [
        { ...SEP_GROCERIES, amount: 1_000 },
        { ...SEP_REFUND, amount: -5_000 },
      ]
      const model = deriveSpending(txns, SELECTED_MONTH)
      expect(model.netTotal).toBe(-4_000)
    })

    it('returns zero net total for an empty transaction list', () => {
      const model = deriveSpending([], SELECTED_MONTH)
      expect(model.netTotal).toBe(0)
    })
  })

  describe('cumulative daily series', () => {
    it('covers every day from day 1 through the last spending day of the month', () => {
      // Spending days in September: 2, 5, 10, 12 (refund)
      // Series should go at least from day 1 to day 12
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const dates = model.cumulativeDailySeries.map((p) => p.date)
      expect(dates).toContain('2026-09-01')
      expect(dates).toContain('2026-09-02')
      expect(dates).toContain('2026-09-12')
    })

    it('accumulates spending correctly across days', () => {
      // Day 2: 8500, Day 5: 8500+6000=14500, Day 10: 14500+25000=39500, Day 12: 39500-5000=34500
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const byDate = new Map(model.cumulativeDailySeries.map((p) => [p.date, p.amount]))
      expect(byDate.get('2026-09-01')).toBe(0)
      expect(byDate.get('2026-09-02')).toBe(8_500)
      expect(byDate.get('2026-09-05')).toBe(14_500)
      expect(byDate.get('2026-09-10')).toBe(39_500)
      expect(byDate.get('2026-09-12')).toBe(34_500)
    })

    it('carries the cumulative total forward on days with no spending', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const byDate = new Map(model.cumulativeDailySeries.map((p) => [p.date, p.amount]))
      // Day 3, 4 have no spending; should carry the day-2 total (8500)
      expect(byDate.get('2026-09-03')).toBe(8_500)
      expect(byDate.get('2026-09-04')).toBe(8_500)
    })

    it('includes transfers in the series timeline but not their amount', () => {
      // SEP_TRANSFER is on day 15; the cumulative should reflect only spending
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const byDate = new Map(model.cumulativeDailySeries.map((p) => [p.date, p.amount]))
      // After day 12 (last spending txn), day 15 should still be 34500
      expect(byDate.get('2026-09-15')).toBe(34_500)
    })

    it('returns an empty series when there are no transactions in the month', () => {
      const model = deriveSpending([], SELECTED_MONTH)
      expect(model.cumulativeDailySeries).toEqual([])
    })
  })

  describe('3-month average daily pace series', () => {
    it('uses the 3 calendar months prior to the selected month', () => {
      // For 2026-09, prior months are 2026-06, 2026-07, 2026-08
      // Jun: 7000 on day 5; Jul: 8000 on day 3; Aug: 9000 on day 2 + 7500 on day 10
      const model = deriveSpending(transactions, SELECTED_MONTH)
      // Day 2 avg cumulative: Aug had 9000 by day 2, Jun/Jul had 0 → avg = 9000/3 = 3000
      const byDay = new Map(model.threeMonthAvgDailySeries.map((p) => [p.dayOfMonth, p.amount]))
      expect(byDay.get(2)).toBe(3_000)
    })

    it('accumulates correctly within each prior month before averaging', () => {
      // Day 10: Aug = 9000+7500=16500, Jul = 8000, Jun = 7000 → avg = (16500+8000+7000)/3 = 10500
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const byDay = new Map(model.threeMonthAvgDailySeries.map((p) => [p.dayOfMonth, p.amount]))
      expect(byDay.get(10)).toBe(10_500)
    })

    it('excludes transfers from the 3-month average', () => {
      // Jul has a transfer on day 5; it should not affect the average
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const byDay = new Map(model.threeMonthAvgDailySeries.map((p) => [p.dayOfMonth, p.amount]))
      // Day 5: Aug = 9000, Jul = 8000, Jun = 7000 → avg = 24000/3 = 8000
      expect(byDay.get(5)).toBe(8_000)
    })

    it('returns an empty series when there are no transactions in any prior month', () => {
      const model = deriveSpending([SEP_GROCERIES], SELECTED_MONTH)
      expect(model.threeMonthAvgDailySeries).toEqual([])
    })
  })

  describe('category breakdown', () => {
    it('groups spending transactions by major category', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const majors = model.categoryBreakdown.map((g) => g.major)
      expect(majors).toContain('Food and personal items')
      expect(majors).toContain('Shopping')
    })

    it('excludes transfers from the category breakdown', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const majors = model.categoryBreakdown.map((g) => g.major)
      expect(majors).not.toContain('Finances')
    })

    it('computes per-major amount correctly (nets refunds within major)', () => {
      // Shopping: 25000 (clothing) - 5000 (refund) = 20000
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const shopping = model.categoryBreakdown.find((g) => g.major === 'Shopping')!
      expect(shopping.amount).toBe(20_000)
    })

    it('computes per-major share as percentage of net total', () => {
      // Net total = 34500; Food: 8500+6000=14500 → 14500/34500 ≈ 42.03%
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const food = model.categoryBreakdown.find((g) => g.major === 'Food and personal items')!
      expect(food.share).toBeCloseTo(14_500 / 34_500 * 100, 5)
    })

    it('computes per-major transaction count', () => {
      // Food: groceries + restaurant = 2
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const food = model.categoryBreakdown.find((g) => g.major === 'Food and personal items')!
      expect(food.count).toBe(2)
    })

    it('allows a category total to go negative when refunds exceed spending', () => {
      const txns: Transaction[] = [
        { ...SEP_CLOTHING, amount: 1_000 },
        { ...SEP_REFUND, amount: -5_000 },
      ]
      const model = deriveSpending(txns, SELECTED_MONTH)
      const shopping = model.categoryBreakdown.find((g) => g.major === 'Shopping')!
      expect(shopping.amount).toBe(-4_000)
    })

    it('expands to subcategories with per-subcategory amount, share, and count', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const food = model.categoryBreakdown.find((g) => g.major === 'Food and personal items')!
      const groceries = food.subcategories.find(
        (s) => s.subcategory === 'Groceries and personal items',
      )!
      const restaurants = food.subcategories.find((s) => s.subcategory === 'Restaurants')!

      expect(groceries.amount).toBe(8_500)
      expect(groceries.count).toBe(1)
      expect(restaurants.amount).toBe(6_000)
      expect(restaurants.count).toBe(1)
      // Share is relative to net total (34500)
      expect(groceries.share).toBeCloseTo(8_500 / 34_500 * 100, 5)
    })
  })

  describe('day-grouped list', () => {
    it('includes all selected-month transactions, including transfers', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allIds = model.dayGroupedList.flatMap((g) => g.transactions.map((t) => t.id))
      expect(allIds).toContain(SEP_GROCERIES.id)
      expect(allIds).toContain(SEP_TRANSFER.id)
    })

    it('groups transactions by date in descending date order', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const groupDates = model.dayGroupedList.map((g) => g.date)
      // Dates should be in descending order
      for (let i = 1; i < groupDates.length; i++) {
        expect(groupDates[i]! < groupDates[i - 1]!).toBe(true)
      }
    })

    it('sets isLowConfidence for plaid_low_confidence transactions', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allTxns = model.dayGroupedList.flatMap((g) => g.transactions)
      const restaurant = allTxns.find((t) => t.id === SEP_RESTAURANT.id)!
      expect(restaurant.isLowConfidence).toBe(true)
    })

    it('does not set isLowConfidence for plaid or user transactions', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allTxns = model.dayGroupedList.flatMap((g) => g.transactions)
      const groceries = allTxns.find((t) => t.id === SEP_GROCERIES.id)!
      const clothing = allTxns.find((t) => t.id === SEP_CLOTHING.id)!
      expect(groceries.isLowConfidence).toBe(false)
      expect(clothing.isLowConfidence).toBe(false)
    })

    it('sets isManualEdit for user-sourced transactions', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allTxns = model.dayGroupedList.flatMap((g) => g.transactions)
      const clothing = allTxns.find((t) => t.id === SEP_CLOTHING.id)!
      expect(clothing.isManualEdit).toBe(true)
    })

    it('does not set isManualEdit for plaid or plaid_low_confidence transactions', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allTxns = model.dayGroupedList.flatMap((g) => g.transactions)
      const groceries = allTxns.find((t) => t.id === SEP_GROCERIES.id)!
      const restaurant = allTxns.find((t) => t.id === SEP_RESTAURANT.id)!
      expect(groceries.isManualEdit).toBe(false)
      expect(restaurant.isManualEdit).toBe(false)
    })
  })

  describe('transfers', () => {
    it('includes transfers in the day-grouped list', () => {
      const model = deriveSpending(transactions, SELECTED_MONTH)
      const allIds = model.dayGroupedList.flatMap((g) => g.transactions.map((t) => t.id))
      expect(allIds).toContain(SEP_TRANSFER.id)
    })

    it('excludes transfers from net total', () => {
      const txns: Transaction[] = [SEP_TRANSFER]
      const model = deriveSpending(txns, SELECTED_MONTH)
      expect(model.netTotal).toBe(0)
    })

    it('excludes transfers from category breakdown', () => {
      const txns: Transaction[] = [SEP_TRANSFER]
      const model = deriveSpending(txns, SELECTED_MONTH)
      expect(model.categoryBreakdown).toEqual([])
    })
  })
})

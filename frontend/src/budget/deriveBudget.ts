/**
 * Pure derivation seam: turns transactions, a budget plan, split ratio, and
 * a holder map into the complete budget view model for a selected month.
 */
import type { BudgetPlanEntry, Transaction } from '../api/types'

// Taxonomy order for budget rows (Finances excluded per spec).
export const BUDGET_MAJORS = [
  'Food and personal items',
  'Shopping',
  'Transportation',
  'Bills',
  'Health and wellness',
  'Housing',
  'Travel',
  'Fun money',
  'Miscellaneous',
] as const

export interface SubcategoryActual {
  subcategory: string | null
  actual_cents: number
}

export interface BudgetRow {
  major: string
  planned_cents: number
  actual_cents: number
  subcategories: SubcategoryActual[]
}

export interface Settlement {
  /** Positive: Jade owes Catherine. Negative: Catherine owes Jade. Zero: balanced. */
  net_cents: number
}

export interface BudgetViewModel {
  rows: BudgetRow[]
  settlement: Settlement
}

export function deriveBudget(
  transactions: Transaction[],
  budgetPlan: BudgetPlanEntry[],
  splitRatio: { catherine: number; jade: number },
  holderByAccountId: Record<string, string>,
  selectedMonth: string,
): BudgetViewModel {
  // 1. Filter to spending transactions in selectedMonth.
  const monthSpending = transactions.filter(
    (t) => t.date.startsWith(selectedMonth) && t.is_spending,
  )

  // 2. Build a lookup: (major, month) -> planned_cents; prefer month override.
  const planLookup = new Map<string, number>() // key: major (template)
  const overrideLookup = new Map<string, number>() // key: `${major}|${month}`
  for (const entry of budgetPlan) {
    if (entry.month === null) {
      planLookup.set(entry.major, entry.planned_cents)
    } else {
      overrideLookup.set(`${entry.major}|${entry.month}`, entry.planned_cents)
    }
  }

  function resolvedPlanned(major: string): number {
    const overrideKey = `${major}|${selectedMonth}`
    if (overrideLookup.has(overrideKey)) return overrideLookup.get(overrideKey)!
    return planLookup.get(major) ?? 0
  }

  // 3. Accumulate actual spending per major -> subcategory.
  const majorActuals = new Map<string, { total: number; subMap: Map<string | null, number> }>()
  for (const txn of monthSpending) {
    const { major, subcategory } = txn.category
    let entry = majorActuals.get(major)
    if (entry === undefined) {
      entry = { total: 0, subMap: new Map() }
      majorActuals.set(major, entry)
    }
    entry.total += txn.amount
    const subKey = subcategory ?? null
    entry.subMap.set(subKey, (entry.subMap.get(subKey) ?? 0) + txn.amount)
  }

  // 4. Build rows in taxonomy order, excluding Finances.
  const rows: BudgetRow[] = BUDGET_MAJORS.map((major) => {
    const actuals = majorActuals.get(major)
    const subcategories: SubcategoryActual[] = actuals
      ? Array.from(actuals.subMap.entries()).map(([sub, amt]) => ({
          subcategory: sub,
          actual_cents: amt,
        }))
      : []
    return {
      major,
      planned_cents: resolvedPlanned(major),
      actual_cents: actuals?.total ?? 0,
      subcategories,
    }
  })

  // 5. Settlement calculation.
  // jade_owes_catherine = jade_ratio * sum(amounts paid from Catherine's accounts)
  // catherine_owes_jade = catherine_ratio * sum(amounts paid from Jade's accounts)
  let catherinePaid = 0
  let jadePaid = 0

  for (const txn of monthSpending) {
    const holder = holderByAccountId[txn.account_id]
    if (holder === undefined) continue // unmapped account excluded
    if (holder === 'Catherine') catherinePaid += txn.amount
    else if (holder === 'Jade') jadePaid += txn.amount
  }

  const jadeOwesCatherine = splitRatio.jade * catherinePaid
  const catherineOwesJade = splitRatio.catherine * jadePaid
  const net_cents = Math.round(jadeOwesCatherine - catherineOwesJade)

  return { rows, settlement: { net_cents } }
}

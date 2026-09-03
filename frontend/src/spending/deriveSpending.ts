/**
 * Pure derivation seam: turns a raw transaction list and a selected month
 * (YYYY-MM) into the complete spending view model.
 */
import type { CategorySource, Transaction } from '../api/types'

export interface SpendingTransactionRow {
  id: string
  accountId: string
  date: string
  merchantName: string | null
  amount: number
  pending: boolean
  category: { major: string; subcategory: string | null }
  categorySource: CategorySource
  isSpending: boolean
  isLowConfidence: boolean
  isManualEdit: boolean
}

export interface DayGroup {
  date: string
  transactions: SpendingTransactionRow[]
}

export interface SubcategoryBreakdown {
  subcategory: string | null
  amount: number
  /** Percentage of the month's net spending total. */
  share: number
  count: number
}

export interface MajorCategoryBreakdown {
  major: string
  amount: number
  /** Percentage of the month's net spending total. */
  share: number
  count: number
  subcategories: SubcategoryBreakdown[]
}

export interface DailyPoint {
  date: string
  amount: number
}

export interface AvgDailyPoint {
  dayOfMonth: number
  amount: number
}

export interface SpendingViewModel {
  netTotal: number
  cumulativeDailySeries: DailyPoint[]
  threeMonthAvgDailySeries: AvgDailyPoint[]
  categoryBreakdown: MajorCategoryBreakdown[]
  dayGroupedList: DayGroup[]
}

function toRow(txn: Transaction): SpendingTransactionRow {
  return {
    id: txn.id,
    accountId: txn.account_id,
    date: txn.date,
    merchantName: txn.merchant_name,
    amount: txn.amount,
    pending: txn.pending,
    category: txn.category,
    categorySource: txn.category_source,
    isSpending: txn.is_spending,
    isLowConfidence: txn.category_source === 'plaid_low_confidence',
    isManualEdit: txn.category_source === 'user',
  }
}

/**
 * Returns the daily cumulative spending series for a set of spending transactions,
 * covering every calendar day from the 1st of the month through the last date
 * seen in the input. Days without any transaction carry forward the previous
 * cumulative total.
 */
function buildCumulativeSeries(txns: Transaction[], selectedMonth: string): DailyPoint[] {
  if (txns.length === 0) return []

  // Sum spending amounts per date
  const spendingByDate = new Map<string, number>()
  for (const txn of txns) {
    if (!txn.is_spending) continue
    spendingByDate.set(txn.date, (spendingByDate.get(txn.date) ?? 0) + txn.amount)
  }

  // Always start from the 1st of the selected month; end at the last transaction date
  const firstDate = `${selectedMonth}-01`
  const allDates = txns.map((t) => t.date).sort()
  const lastDate = allDates[allDates.length - 1]!

  const series: DailyPoint[] = []
  let cumulative = 0
  const cursor = new Date(firstDate + 'T00:00:00')
  const end = new Date(lastDate + 'T00:00:00')

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    cumulative += spendingByDate.get(dateStr) ?? 0
    series.push({ date: dateStr, amount: cumulative })
    cursor.setDate(cursor.getDate() + 1)
  }

  return series
}

/**
 * Returns the 3 calendar months immediately preceding `selectedMonth` (YYYY-MM).
 * E.g., '2026-09' → ['2026-06', '2026-07', '2026-08'].
 */
function priorThreeMonths(selectedMonth: string): string[] {
  const [year, month] = selectedMonth.split('-').map(Number) as [number, number]
  const months: string[] = []
  for (let i = 3; i >= 1; i--) {
    let m = month - i
    let y = year
    while (m <= 0) {
      m += 12
      y -= 1
    }
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return months
}

/**
 * Builds the 3-month average daily pace series.
 * For each prior month, computes the cumulative spending per day-of-month, then
 * averages across the 3 months at each day-of-month position.
 */
function buildAvgDailySeries(
  allTransactions: Transaction[],
  priorMonths: string[],
): AvgDailyPoint[] {
  // For each prior month, build a map of dayOfMonth → cumulative spending
  const monthlyDayTotals: Map<number, number>[] = priorMonths.map((month) => {
    const monthTxns = allTransactions.filter(
      (t) => t.date.startsWith(month) && t.is_spending,
    )
    if (monthTxns.length === 0) return new Map()

    const spendingByDay = new Map<number, number>()
    for (const txn of monthTxns) {
      const day = parseInt(txn.date.slice(8, 10), 10)
      spendingByDay.set(day, (spendingByDay.get(day) ?? 0) + txn.amount)
    }

    // Build cumulative within this month, day 1 through last day with activity
    const lastDay = Math.max(...spendingByDay.keys())
    const cumByDay = new Map<number, number>()
    let cum = 0
    for (let d = 1; d <= lastDay; d++) {
      cum += spendingByDay.get(d) ?? 0
      cumByDay.set(d, cum)
    }
    return cumByDay
  })

  // Find the max day-of-month any prior month covered
  const maxDay = Math.max(0, ...monthlyDayTotals.map((m) => Math.max(0, ...m.keys())))
  if (maxDay === 0) return []

  const result: AvgDailyPoint[] = []
  for (let d = 1; d <= maxDay; d++) {
    let sum = 0
    for (const cumByDay of monthlyDayTotals) {
      // For months that ended before day d, carry forward their final total
      if (cumByDay.size === 0) continue
      const monthMax = Math.max(...cumByDay.keys())
      const value = cumByDay.get(Math.min(d, monthMax)) ?? 0
      sum += value
    }
    result.push({ dayOfMonth: d, amount: Math.round(sum / priorMonths.length) })
  }
  return result
}

function buildCategoryBreakdown(
  spendingTxns: Transaction[],
  netTotal: number,
): MajorCategoryBreakdown[] {
  // Accumulate per major → per subcategory
  const majorMap = new Map<
    string,
    { amount: number; count: number; subMap: Map<string | null, { amount: number; count: number }> }
  >()

  for (const txn of spendingTxns) {
    const { major, subcategory } = txn.category
    let entry = majorMap.get(major)
    if (entry === undefined) {
      entry = { amount: 0, count: 0, subMap: new Map() }
      majorMap.set(major, entry)
    }
    entry.amount += txn.amount
    entry.count += 1

    const subKey = subcategory ?? null
    const subEntry = entry.subMap.get(subKey) ?? { amount: 0, count: 0 }
    subEntry.amount += txn.amount
    subEntry.count += 1
    entry.subMap.set(subKey, subEntry)
  }

  const totalForShare = netTotal === 0 ? 1 : netTotal

  return Array.from(majorMap.entries()).map(([major, entry]) => ({
    major,
    amount: entry.amount,
    share: (entry.amount / totalForShare) * 100,
    count: entry.count,
    subcategories: Array.from(entry.subMap.entries()).map(([sub, subEntry]) => ({
      subcategory: sub,
      amount: subEntry.amount,
      share: (subEntry.amount / totalForShare) * 100,
      count: subEntry.count,
    })),
  }))
}

export function deriveSpending(
  allTransactions: Transaction[],
  selectedMonth: string,
): SpendingViewModel {
  const monthTxns = allTransactions.filter((t) => t.date.startsWith(selectedMonth))
  const spendingTxns = monthTxns.filter((t) => t.is_spending)

  const netTotal = spendingTxns.reduce((sum, t) => sum + t.amount, 0)

  const cumulativeDailySeries = buildCumulativeSeries(monthTxns, selectedMonth)

  const priorMonths = priorThreeMonths(selectedMonth)
  const threeMonthAvgDailySeries = buildAvgDailySeries(allTransactions, priorMonths)

  const categoryBreakdown = buildCategoryBreakdown(spendingTxns, netTotal)

  // Day-grouped list: all selected-month transactions, grouped by date, descending
  const byDate = new Map<string, SpendingTransactionRow[]>()
  for (const txn of monthTxns) {
    const rows = byDate.get(txn.date) ?? []
    rows.push(toRow(txn))
    byDate.set(txn.date, rows)
  }
  const dayGroupedList: DayGroup[] = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, transactions]) => ({ date, transactions }))

  return {
    netTotal,
    cumulativeDailySeries,
    threeMonthAvgDailySeries,
    categoryBreakdown,
    dayGroupedList,
  }
}

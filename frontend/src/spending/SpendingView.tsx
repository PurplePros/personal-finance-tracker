import { useState } from 'react'
import type { CategoryTaxonomy } from '../api/types'
import type { AvgDailyPoint, DailyPoint, MajorCategoryBreakdown, SpendingTransactionRow } from './deriveSpending'
import { deriveSpending } from './deriveSpending'
import { useSpending } from './SpendingContext'

const cadCurrency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

function formatAmount(cents: number): string {
  return cadCurrency.format(cents / 100)
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function lastTwelveMonths(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const y = now.getFullYear()
    const m = now.getMonth() - i
    const d = new Date(y, m, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number)
  return new Date(year!, month! - 1, 1).toLocaleDateString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food and personal items': '#4a9e6b',
  'Shopping': '#5b7fa3',
  'Transportation': '#d97b3a',
  'Bills': '#8b6db3',
  'Health and wellness': '#c45a5a',
  'Housing': '#7a6049',
  'Travel': '#3a9bb3',
  'Fun money': '#c45e89',
  'Finances': '#6a8496',
  'Miscellaneous': '#888f85',
}

const CATEGORY_ICONS: Record<string, string> = {
  'Food and personal items': '🍽️',
  'Shopping': '🛍️',
  'Transportation': '🚗',
  'Bills': '📱',
  'Health and wellness': '💪',
  'Housing': '🏠',
  'Travel': '✈️',
  'Fun money': '🎉',
  'Finances': '💰',
  'Miscellaneous': '📦',
}

function categoryColor(major: string): string {
  return CATEGORY_COLORS[major] ?? '#888f85'
}

function categoryIcon(major: string): string {
  return CATEGORY_ICONS[major] ?? '📦'
}

// --- Month Picker ---

function MonthPicker({ value, months, onChange }: {
  value: string
  months: string[]
  onChange: (m: string) => void
}) {
  return (
    <select
      className="month-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select month"
    >
      {months.map((m) => (
        <option key={m} value={m}>{formatMonthLabel(m)}</option>
      ))}
    </select>
  )
}

// --- Treemap (squarified 2D layout) ---

interface SquarifyItem {
  value: number
  cat: MajorCategoryBreakdown
}

interface SquarifyRect {
  x: number
  y: number
  w: number
  h: number
  cat: MajorCategoryBreakdown
}

function worstRatio(row: SquarifyItem[], rowSum: number, total: number, long: number, short: number): number {
  const stripLen = (rowSum / total) * long
  let worst = 0
  for (const it of row) {
    const itemLen = (it.value / rowSum) * short
    if (itemLen === 0) continue
    worst = Math.max(worst, Math.max(stripLen / itemLen, itemLen / stripLen))
  }
  return worst
}

function squarify(items: SquarifyItem[], x: number, y: number, w: number, h: number, total: number): SquarifyRect[] {
  if (items.length === 0 || total === 0 || w <= 0 || h <= 0) return []
  if (items.length === 1) return [{ x, y, w, h, cat: items[0].cat }]

  const isWide = w >= h
  const long = isWide ? w : h
  const short = isWide ? h : w

  let row: SquarifyItem[] = [items[0]]
  let rowSum = items[0].value

  for (let i = 1; i < items.length; i++) {
    const candidate = items[i]
    const newRowSum = rowSum + candidate.value
    if (worstRatio([...row, candidate], newRowSum, total, long, short) <= worstRatio(row, rowSum, total, long, short)) {
      row.push(candidate)
      rowSum = newRowSum
    } else {
      break
    }
  }

  const stripLen = (rowSum / total) * long
  const rects: SquarifyRect[] = []
  let pos = isWide ? y : x

  for (const it of row) {
    const itemLen = (it.value / rowSum) * short
    rects.push(isWide
      ? { x, y: pos, w: stripLen, h: itemLen, cat: it.cat }
      : { x: pos, y, w: itemLen, h: stripLen, cat: it.cat })
    pos += itemLen
  }

  const remaining = items.slice(row.length)
  const rest = isWide
    ? squarify(remaining, x + stripLen, y, w - stripLen, h, total - rowSum)
    : squarify(remaining, x, y + stripLen, w, h - stripLen, total - rowSum)

  return [...rects, ...rest]
}

// Canvas dimensions — aspect ratio ~3.2:1
const TM_W = 800
const TM_H = 250
const TM_GAP = 3

function SpendingTreemap({ breakdown }: { breakdown: MajorCategoryBreakdown[] }) {
  const spending = breakdown.filter((b) => b.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = spending.reduce((s, b) => s + b.amount, 0)
  if (total === 0) return null

  const items = spending.map((cat) => ({ value: cat.amount, cat }))
  const rects = squarify(items, 0, 0, TM_W, TM_H, total)

  return (
    <div className="spending-treemap" role="img" aria-label="Spending by category">
      {rects.map(({ x, y, w, h, cat }) => {
        const pct = (cat.amount / total) * 100
        return (
          <div
            key={cat.major}
            className="treemap-segment"
            style={{
              left: `${((x + TM_GAP / 2) / TM_W) * 100}%`,
              top: `${((y + TM_GAP / 2) / TM_H) * 100}%`,
              width: `${((w - TM_GAP) / TM_W) * 100}%`,
              height: `${((h - TM_GAP) / TM_H) * 100}%`,
              background: categoryColor(cat.major),
            }}
            title={`${cat.major}: ${formatAmount(cat.amount)} (${pct.toFixed(1)}%)`}
          >
            <div className="treemap-label">
              <span className="treemap-name">{cat.major}</span>
              <span className="treemap-pct">{pct.toFixed(0)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Ranked Category List ---

function CategoryRankedList({ breakdown }: { breakdown: MajorCategoryBreakdown[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sorted = [...breakdown].sort((a, b) => b.amount - a.amount)

  function toggle(major: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(major)) next.delete(major)
      else next.add(major)
      return next
    })
  }

  if (sorted.length === 0) {
    return <p className="empty-state">No spending this month.</p>
  }

  return (
    <ul className="category-ranked-list">
      {sorted.map((cat) => {
        const isOpen = expanded.has(cat.major)
        return (
          <li key={cat.major} className="category-ranked-item">
            <button
              className="category-ranked-row"
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(cat.major)}
            >
              <span className="crr-icon" style={{ color: categoryColor(cat.major) }}>
                {categoryIcon(cat.major)}
              </span>
              <span className="crr-name">{cat.major}</span>
              <span className="crr-count">{cat.count} item{cat.count !== 1 ? 's' : ''}</span>
              <span className="crr-share">{cat.share.toFixed(1)}%</span>
              <span className="crr-amount">{formatAmount(cat.amount)}</span>
              <span className="crr-chevron" aria-hidden>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <ul className="subcategory-list">
                {[...cat.subcategories]
                  .sort((a, b) => b.amount - a.amount)
                  .map((sub) => (
                    <li key={sub.subcategory ?? 'other'} className="subcategory-row">
                      <span className="sub-name">{sub.subcategory ?? 'Other'}</span>
                      <span className="sub-count">{sub.count}</span>
                      <span className="sub-share">{sub.share.toFixed(1)}%</span>
                      <span className="sub-amount">{formatAmount(sub.amount)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// --- Pace Chart (SVG) ---

function PaceChart({
  cumulativeSeries,
  avgSeries,
  selectedMonth,
}: {
  cumulativeSeries: DailyPoint[]
  avgSeries: AvgDailyPoint[]
  selectedMonth: string
}) {
  if (cumulativeSeries.length === 0 && avgSeries.length === 0) return null

  const W = 560
  const H = 160
  const PAD = { top: 8, right: 12, bottom: 24, left: 52 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const maxDay = Math.max(
    cumulativeSeries.length > 0
      ? parseInt(cumulativeSeries.at(-1)!.date.slice(8), 10)
      : 1,
    avgSeries.length > 0 ? avgSeries.at(-1)!.dayOfMonth : 1,
  )

  const maxAmt = Math.max(
    ...cumulativeSeries.map((p) => p.amount),
    ...avgSeries.map((p) => p.amount),
    1,
  )

  function xp(day: number) {
    return PAD.left + ((day - 1) / Math.max(maxDay - 1, 1)) * iW
  }
  function yp(amt: number) {
    return PAD.top + (1 - amt / maxAmt) * iH
  }

  const cumPts = cumulativeSeries
    .map((p) => `${xp(parseInt(p.date.slice(8), 10))},${yp(p.amount)}`)
    .join(' ')

  const avgPts = avgSeries.map((p) => `${xp(p.dayOfMonth)},${yp(p.amount)}`).join(' ')

  const yTicks = [0, 0.5, 1].map((f) => ({
    y: yp(f * maxAmt),
    label: formatAmount(Math.round(f * maxAmt)),
  }))

  return (
    <div className="pace-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="pace-chart" aria-label="Cumulative spending pace">
        {yTicks.map(({ y, label }) => (
          <g key={label}>
            <line
              x1={PAD.left} y1={y} x2={PAD.left + iW} y2={y}
              stroke="#d7d9cc" strokeWidth="1"
            />
            <text x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#5a6a61">
              {label}
            </text>
          </g>
        ))}
        {avgSeries.length > 0 && (
          <polyline
            points={avgPts}
            fill="none"
            stroke="#b6d28b"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
        )}
        {cumulativeSeries.length > 0 && (
          <polyline
            points={cumPts}
            fill="none"
            stroke="#17372c"
            strokeWidth="2.5"
          />
        )}
        {/* Legend */}
        <g fontSize="10">
          <line
            x1={PAD.left} y1={H - 8} x2={PAD.left + 18} y2={H - 8}
            stroke="#17372c" strokeWidth="2.5"
          />
          <text x={PAD.left + 22} y={H - 5} fill="#17372c">
            {formatMonthLabel(selectedMonth)}
          </text>
          <line
            x1={PAD.left + 130} y1={H - 8} x2={PAD.left + 148} y2={H - 8}
            stroke="#b6d28b" strokeWidth="2" strokeDasharray="5 3"
          />
          <text x={PAD.left + 152} y={H - 5} fill="#5a6a61">3-month avg</text>
        </g>
      </svg>
    </div>
  )
}

// --- Category Picker ---

function CategoryPicker({
  row,
  categories,
  onPatch,
}: {
  row: SpendingTransactionRow
  categories: CategoryTaxonomy[]
  onPatch: (txnId: string, category: { major: string; subcategory: string } | null) => Promise<void>
}) {
  const [isPending, setIsPending] = useState(false)
  const [patchError, setPatchError] = useState<string | null>(null)

  // Miscellaneous has no subcategories and can't be set as user category
  const pickable = categories.filter((c) => c.subcategories.length > 0)

  const currentValue = row.category.subcategory
    ? `${row.category.major}|${row.category.subcategory}`
    : '__clear__'

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === currentValue) return
    setIsPending(true)
    setPatchError(null)
    try {
      if (val === '__clear__') {
        await onPatch(row.id, null)
      } else {
        const sepIdx = val.indexOf('|')
        const major = val.slice(0, sepIdx)
        const subcategory = val.slice(sepIdx + 1)
        await onPatch(row.id, { major, subcategory })
      }
    } catch {
      setPatchError('Save failed')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="category-picker-wrap">
      {patchError && <span className="category-picker-error">{patchError}</span>}
      <select
        className="category-picker"
        value={currentValue}
        disabled={isPending}
        onChange={(e) => void handleChange(e)}
        aria-label="Change category"
      >
      {pickable.map((cat) => (
        <optgroup key={cat.major} label={cat.major}>
          {cat.subcategories.map((sub) => (
            <option key={`${cat.major}|${sub}`} value={`${cat.major}|${sub}`}>
              {sub}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="__clear__">Reset to auto</option>
      </select>
    </div>
  )
}

// --- Transaction Row ---

function TransactionRow({
  row,
  categories,
  isEditing,
  onPatch,
}: {
  row: SpendingTransactionRow
  categories: CategoryTaxonomy[]
  isEditing: boolean
  onPatch: (txnId: string, category: { major: string; subcategory: string } | null) => Promise<void>
}) {
  return (
    <li className="txn-row">
      <span className="txn-icon" aria-label={row.category.major}>
        {categoryIcon(row.category.major)}
      </span>
      <div className="txn-main">
        <div className="txn-merchant">{row.name ?? row.merchantName ?? 'Unknown'}</div>
        {row.category.subcategory && (
          <div className="txn-subcategory">{row.category.subcategory}</div>
        )}
        <div className="txn-meta">
          {row.pending && <span className="badge badge-pending">Pending</span>}
          {row.isLowConfidence && <span className="badge badge-low-confidence">Low confidence</span>}
          {row.isManualEdit && <span className="badge badge-manual">Manual edit</span>}
        </div>
      </div>
      <div className="txn-right">
        <span className={`txn-amount ${row.amount < 0 ? 'txn-refund' : ''}`}>
          {row.amount < 0
            ? `−${formatAmount(-row.amount)}`
            : formatAmount(row.amount)}
        </span>
        {isEditing && <CategoryPicker row={row} categories={categories} onPatch={onPatch} />}
      </div>
    </li>
  )
}

// --- Day Group ---

function DayGroup({
  date,
  transactions,
  categories,
  isEditing,
  onPatch,
}: {
  date: string
  transactions: SpendingTransactionRow[]
  categories: CategoryTaxonomy[]
  isEditing: boolean
  onPatch: (txnId: string, category: { major: string; subcategory: string } | null) => Promise<void>
}) {
  return (
    <section className="day-group">
      <h3 className="day-group-header">{formatDateLabel(date)}</h3>
      <ul className="txn-list">
        {transactions.map((row) => (
          <TransactionRow key={row.id} row={row} categories={categories} isEditing={isEditing} onPatch={onPatch} />
        ))}
      </ul>
    </section>
  )
}

// --- Pencil icon SVG ---

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.987,5.452c-.028-.177-.312-1.767-1.464-2.928-1.157-1.132-2.753-1.412-2.931-1.44-.237-.039-.479,.011-.682,.137-.071,.044-1.114,.697-3.173,2.438,1.059,.374,2.428,1.023,3.538,2.109,1.114,1.09,1.78,2.431,2.162,3.471,1.72-2.01,2.367-3.028,2.41-3.098,.128-.205,.178-.45,.14-.689Z" />
      <path d="M12.95,5.223c-1.073,.968-2.322,2.144-3.752,3.564C3.135,14.807,1.545,17.214,1.48,17.313c-.091,.14-.146,.301-.159,.467l-.319,4.071c-.022,.292,.083,.578,.29,.785,.188,.188,.443,.293,.708,.293,.025,0,.051,0,.077-.003l4.101-.316c.165-.013,.324-.066,.463-.155,.1-.064,2.523-1.643,8.585-7.662,1.462-1.452,2.668-2.716,3.655-3.797-.151-.649-.678-2.501-2.005-3.798-1.346-1.317-3.283-1.833-3.927-1.975Z" />
    </svg>
  )
}

// --- Main View ---

export default function SpendingView() {
  const { transactions, categories, isLoading, error } = useSpending()
  const { patchCategory } = useSpending()

  const months = lastTwelveMonths()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      const stored = localStorage.getItem('spending-selected-month')
      if (stored && months.includes(stored)) return stored
    } catch {}
    return currentMonth()
  })

  function handleMonthChange(m: string) {
    setSelectedMonth(m)
    try { localStorage.setItem('spending-selected-month', m) } catch {}
  }
  const [isEditing, setIsEditing] = useState(false)

  const model = deriveSpending(transactions, selectedMonth)

  return (
    <div className="spending-view">
      <div className="spending-header">
        <MonthPicker value={selectedMonth} months={months} onChange={handleMonthChange} />
        {model.netTotal !== 0 && (
          <p className="spending-net-total">
            <span className="net-total-label">Total</span>
            <strong className="net-total-value">{formatAmount(model.netTotal)}</strong>
          </p>
        )}
      </div>

      {isLoading && <p className="spending-loading">Loading transactions…</p>}
      {error && <p className="spending-error">{error}</p>}

      {!isLoading && !error && transactions.length === 0 && (
        <p className="empty-state">No transactions yet. Try syncing your accounts.</p>
      )}

      {(model.categoryBreakdown.length > 0 || model.cumulativeDailySeries.length > 0 || model.threeMonthAvgDailySeries.length > 0) && (
        <section className="breakdown-section" aria-label="Spending breakdown">
          <h2 className="section-heading">Breakdown</h2>
          {model.categoryBreakdown.length > 0 && (
            <>
              <SpendingTreemap breakdown={model.categoryBreakdown} />
              <CategoryRankedList breakdown={model.categoryBreakdown} />
            </>
          )}
          {(model.cumulativeDailySeries.length > 0 || model.threeMonthAvgDailySeries.length > 0) && (
            <PaceChart
              cumulativeSeries={model.cumulativeDailySeries}
              avgSeries={model.threeMonthAvgDailySeries}
              selectedMonth={selectedMonth}
            />
          )}
        </section>
      )}

      {model.dayGroupedList.length > 0 && (
        <section className="txn-section" aria-label="Transactions">
          <div className="txn-section-header">
            <h2 className="section-heading">Transactions</h2>
            {isEditing ? (
              <button className="txn-edit-btn txn-save-btn" type="button" onClick={() => setIsEditing(false)}>
                Save
              </button>
            ) : (
              <button
                className="txn-edit-btn txn-pencil-btn"
                type="button"
                aria-label="Edit categories"
                onClick={() => setIsEditing(true)}
              >
                <PencilIcon />
              </button>
            )}
          </div>
          {model.dayGroupedList.map((group) => (
            <DayGroup
              key={group.date}
              date={group.date}
              transactions={group.transactions}
              categories={categories}
              isEditing={isEditing}
              onPatch={patchCategory}
            />
          ))}
        </section>
      )}
    </div>
  )
}

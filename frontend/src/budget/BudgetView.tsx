import { useState } from 'react'
import { useAccounts } from '../accounts/AccountsContext'
import { useSpending } from '../spending/SpendingContext'
import { deriveBudget } from './deriveBudget'
import { useBudget } from './BudgetContext'

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
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
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

// --- Inline Planned Amount Editor ---

function PlannedCell({
  major,
  plannedCents,
  selectedMonth,
  onSave,
}: {
  major: string
  plannedCents: number
  selectedMonth: string
  onSave: (major: string, month: string | null, cents: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [choice, setChoice] = useState<'ask' | null>(null)
  const isCurrentMonth = selectedMonth === currentMonth()

  function startEdit() {
    setValue((plannedCents / 100).toFixed(2))
    setChoice(null)
    setEditing(true)
  }

  async function commit(month: string | null) {
    const cents = Math.round(parseFloat(value) * 100)
    if (isNaN(cents)) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(major, month, cents)
    } finally {
      setSaving(false)
      setEditing(false)
      setChoice(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setEditing(false); setChoice(null) }
    if (e.key === 'Enter') {
      if (isCurrentMonth) void commit(null)
      else setChoice('ask')
    }
  }

  function handleBlur() {
    if (choice !== 'ask') setEditing(false)
  }

  if (!editing) {
    return (
      <button
        className="planned-cell planned-cell--editable"
        type="button"
        onClick={startEdit}
        aria-label={`Edit planned amount for ${major}`}
      >
        {formatAmount(plannedCents)}
      </button>
    )
  }

  if (choice === 'ask') {
    return (
      <span className="planned-cell planned-cell--choice">
        <button type="button" onClick={() => void commit(selectedMonth)}>This month only</button>
        <button type="button" onClick={() => void commit(null)}>Update template</button>
        <button type="button" onClick={() => { setEditing(false); setChoice(null) }}>Cancel</button>
      </span>
    )
  }

  return (
    <input
      autoFocus
      className="planned-cell planned-cell--input"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label={`Planned amount for ${major}`}
    />
  )
}

// --- Budget Row ---

interface BudgetRowProps {
  major: string
  plannedCents: number
  actualCents: number
  subcategories: { subcategory: string | null; actual_cents: number; has_manual: boolean }[]
  selectedMonth: string
  onSavePlanned: (major: string, month: string | null, cents: number) => Promise<void>
}

function BudgetRowItem({ major, plannedCents, actualCents, subcategories, selectedMonth, onSavePlanned }: BudgetRowProps) {
  const [expanded, setExpanded] = useState(false)
  const variance = plannedCents - actualCents

  return (
    <>
      <tr className={`budget-row ${variance < 0 ? 'budget-row--over' : variance > 0 ? 'budget-row--under' : ''}`}>
        <td className="budget-cell budget-cell--name">
          <button
            className="budget-expand-btn"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="budget-expand-chevron" aria-hidden>{expanded ? '▲' : '▼'}</span>
            {major}
          </button>
        </td>
        <td className="budget-cell budget-cell--planned">
          <PlannedCell
            major={major}
            plannedCents={plannedCents}
            selectedMonth={selectedMonth}
            onSave={onSavePlanned}
          />
        </td>
        <td className="budget-cell budget-cell--actual">{formatAmount(actualCents)}</td>
        <td className="budget-cell budget-cell--variance">
          {plannedCents > 0 && (
            <span className={variance < 0 ? 'variance--over' : 'variance--under'}>
              {variance < 0 ? `−${formatAmount(-variance)}` : `+${formatAmount(variance)}`}
            </span>
          )}
        </td>
      </tr>
      {expanded && subcategories.map((sub) => (
        <tr key={sub.subcategory ?? 'other'} className="budget-subrow">
          <td className="budget-cell budget-cell--subname">
            {sub.subcategory ?? 'Other'}
            {sub.has_manual && <span className="manual-badge" title="Includes manually entered transactions">M</span>}
          </td>
          <td className="budget-cell" />
          <td className="budget-cell budget-cell--actual">{formatAmount(sub.actual_cents)}</td>
          <td className="budget-cell" />
        </tr>
      ))}
    </>
  )
}

// --- Settlement Section ---

function SettlementSection({ netCents }: { netCents: number }) {
  if (netCents === 0) {
    return (
      <section className="settlement-section">
        <h2 className="section-heading">Settlement</h2>
        <p className="settlement-balanced">All settled up for this month.</p>
      </section>
    )
  }

  const label = netCents > 0
    ? `Jade owes you ${formatAmount(netCents)}`
    : `You owe Jade ${formatAmount(-netCents)}`

  return (
    <section className="settlement-section">
      <h2 className="section-heading">Settlement</h2>
      <p className={`settlement-amount ${netCents > 0 ? 'settlement--positive' : 'settlement--negative'}`}>
        {label}
      </p>
    </section>
  )
}

// --- Main View ---

export default function BudgetView() {
  const { transactions } = useSpending()
  const { budgetPlan, settings, isLoading, error, saveTemplate, saveOverride } = useBudget()
  const { institutions, accounts } = useAccounts()

  const months = lastTwelveMonths()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      const stored = localStorage.getItem('budget-selected-month')
      if (stored && months.includes(stored)) return stored
    } catch {}
    return currentMonth()
  })

  function handleMonthChange(m: string) {
    setSelectedMonth(m)
    try { localStorage.setItem('budget-selected-month', m) } catch {}
  }

  // Build holderByAccountId: account.id -> institution.holder.
  // Uses raw accounts (including Manual) so manual transactions participate in settlement.
  const holderByAccountId: Record<string, string> = {}
  const holderById = new Map(institutions.map((i) => [i.id, i.holder]))
  for (const acc of accounts) {
    const holder = holderById.get(acc.institution_id)
    if (holder) holderByAccountId[acc.id] = holder
  }

  const splitRatio = {
    catherine: settings.catherine_ratio,
    jade: 1 - settings.catherine_ratio,
  }

  const model = deriveBudget(transactions, budgetPlan, splitRatio, holderByAccountId, selectedMonth)

  async function handleSavePlanned(major: string, month: string | null, cents: number) {
    if (month !== null) {
      await saveOverride(major, month, cents)
    } else {
      await saveTemplate(major, cents)
    }
  }

  return (
    <div className="budget-view">
      <div className="budget-header">
        <select
          className="month-picker"
          value={selectedMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          aria-label="Select month"
        >
          {months.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="budget-loading">Loading budget…</p>}
      {error && <p className="budget-error">{error}</p>}

      {!isLoading && !error && (
        <>
          <section className="budget-table-section" aria-label="Budget">
            <table className="budget-table">
              <thead>
                <tr>
                  <th className="budget-th budget-th--name">Category</th>
                  <th className="budget-th budget-th--planned">Planned</th>
                  <th className="budget-th budget-th--actual">Actual</th>
                  <th className="budget-th budget-th--variance">Variance</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => (
                  <BudgetRowItem
                    key={row.major}
                    major={row.major}
                    plannedCents={row.planned_cents}
                    actualCents={row.actual_cents}
                    subcategories={row.subcategories}
                    selectedMonth={selectedMonth}
                    onSavePlanned={handleSavePlanned}
                  />
                ))}
              </tbody>
            </table>
          </section>

          <SettlementSection netCents={model.settlement.net_cents} />
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  createManualInstitution,
  deleteManualInstitution,
  fetchManualInstitutions,
  fetchSettings,
  patchSettings,
} from '../api/client'
import type { ManualInstitution } from '../api/types'
import { useBudget } from '../budget/BudgetContext'

const HOLDERS = ['Catherine', 'Jade'] as const

export default function SettingsView() {
  const { refresh: refreshBudget } = useBudget()

  // --- Split ratio ---
  const [catherineRatio, setCatherineRatio] = useState(0.5)
  const [jadeRatio, setJadeRatio] = useState(0.5)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // --- Manual institutions ---
  const [manualInstitutions, setManualInstitutions] = useState<ManualInstitution[]>([])
  const [addName, setAddName] = useState('')
  const [addHolder, setAddHolder] = useState<typeof HOLDERS[number]>('Catherine')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSettings(), fetchManualInstitutions()])
      .then(([s, insts]) => {
        setCatherineRatio(s.catherine_ratio)
        setJadeRatio(1 - s.catherine_ratio)
        setManualInstitutions(insts)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load settings.'))
      .finally(() => setIsLoading(false))
  }, [])

  function handleCatherineChange(val: string) {
    const pct = parseFloat(val)
    if (isNaN(pct)) return
    const ratio = Math.max(0, Math.min(100, pct)) / 100
    setCatherineRatio(ratio)
    setJadeRatio(1 - ratio)
  }

  function handleJadeChange(val: string) {
    const pct = parseFloat(val)
    if (isNaN(pct)) return
    const ratio = Math.max(0, Math.min(100, pct)) / 100
    setCatherineRatio(1 - ratio)
    setJadeRatio(ratio)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (catherineRatio <= 0 || catherineRatio >= 1) {
      setError('Split must be between 1% and 99%.')
      return
    }
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await patchSettings(catherineRatio)
      setCatherineRatio(updated.catherine_ratio)
      setJadeRatio(1 - updated.catherine_ratio)
      setSaved(true)
      void refreshBudget()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddInstitution(e: React.FormEvent) {
    e.preventDefault()
    const name = addName.trim()
    if (!name) return
    setIsAdding(true)
    setAddError(null)
    try {
      const inst = await createManualInstitution(name, addHolder)
      setManualInstitutions((prev) => [...prev, inst].sort((a, b) => a.name.localeCompare(b.name)))
      setAddName('')
    } catch (cause) {
      setAddError(cause instanceof Error ? cause.message : 'Unable to add institution.')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await deleteManualInstitution(id)
      setManualInstitutions((prev) => prev.filter((i) => i.id !== id))
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Unable to delete institution.')
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading) return <div className="settings-view"><p>Loading settings…</p></div>

  return (
    <div className="settings-view">
      <h1 className="settings-heading">Settings</h1>

      <section className="settings-section">
        <h2 className="settings-subheading">Expense split</h2>
        <p className="settings-description">
          How shared expenses are split between Catherine and Jade. The two values always sum to 100%.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="settings-form">
          <div className="settings-field">
            <label htmlFor="catherine-pct" className="settings-label">Catherine %</label>
            <input
              id="catherine-pct"
              type="number"
              className="settings-input"
              value={Math.round(catherineRatio * 100)}
              min={1}
              max={99}
              disabled={isSaving}
              onChange={(e) => handleCatherineChange(e.target.value)}
            />
          </div>
          <div className="settings-field">
            <label htmlFor="jade-pct" className="settings-label">Jade %</label>
            <input
              id="jade-pct"
              type="number"
              className="settings-input"
              value={Math.round(jadeRatio * 100)}
              min={1}
              max={99}
              disabled={isSaving}
              onChange={(e) => handleJadeChange(e.target.value)}
            />
          </div>

          {error && <p className="settings-error" role="alert">{error}</p>}
          {saved && <p className="settings-saved" role="status">Saved.</p>}

          <button className="settings-save-btn" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2 className="settings-subheading">Manual institutions</h2>
        <p className="settings-description">
          Add institutions that Plaid doesn't support. Transactions from these institutions are entered by hand in the Spending view.
        </p>

        {manualInstitutions.length > 0 && (
          <ul className="manual-institutions-list">
            {manualInstitutions.map((inst) => (
              <li key={inst.id} className="manual-institution-row">
                <span className="manual-institution-name">{inst.name}</span>
                <span className="manual-institution-holder">{inst.holder}</span>
                <button
                  className="manual-institution-delete"
                  type="button"
                  disabled={deletingId === inst.id}
                  onClick={() => void handleDelete(inst.id)}
                  aria-label={`Remove ${inst.name}`}
                >
                  {deletingId === inst.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {deleteError && <p className="settings-error" role="alert">{deleteError}</p>}

        <form onSubmit={(e) => void handleAddInstitution(e)} className="settings-form settings-form--inline">
          <div className="settings-field">
            <label htmlFor="inst-name" className="settings-label">Name</label>
            <input
              id="inst-name"
              type="text"
              className="settings-input"
              placeholder="e.g. BMO"
              value={addName}
              disabled={isAdding}
              onChange={(e) => setAddName(e.target.value)}
            />
          </div>
          <div className="settings-field">
            <label htmlFor="inst-holder" className="settings-label">Holder</label>
            <select
              id="inst-holder"
              className="settings-input"
              value={addHolder}
              disabled={isAdding}
              onChange={(e) => setAddHolder(e.target.value as typeof HOLDERS[number])}
            >
              {HOLDERS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {addError && <p className="settings-error" role="alert">{addError}</p>}

          <button className="settings-save-btn" type="submit" disabled={isAdding || !addName.trim()}>
            {isAdding ? 'Adding…' : 'Add institution'}
          </button>
        </form>
      </section>
    </div>
  )
}

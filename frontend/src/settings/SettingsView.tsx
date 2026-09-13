import { useEffect, useState } from 'react'
import { fetchSettings, patchSettings } from '../api/client'
import { useBudget } from '../budget/BudgetContext'

export default function SettingsView() {
  const { refresh: refreshBudget } = useBudget()
  const [catherineRatio, setCatherineRatio] = useState(0.5)
  const [jadeRatio, setJadeRatio] = useState(0.5)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setCatherineRatio(s.catherine_ratio)
        setJadeRatio(1 - s.catherine_ratio)
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
    </div>
  )
}

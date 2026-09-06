import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  fetchBudgetPlan,
  fetchSettings,
  putBudgetOverride,
  putBudgetTemplate,
} from '../api/client'
import type { AppSettings, BudgetPlanEntry } from '../api/types'

export interface BudgetContextValue {
  budgetPlan: BudgetPlanEntry[]
  settings: AppSettings
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveTemplate: (major: string, plannedCents: number) => Promise<void>
  saveOverride: (major: string, month: string, plannedCents: number) => Promise<void>
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext)
  if (!ctx) throw new Error('useBudget must be used inside BudgetProvider')
  return ctx
}

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlanEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>({ catherine_ratio: 0.5 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [plan, s] = await Promise.all([fetchBudgetPlan(), fetchSettings()])
      setBudgetPlan(plan)
      setSettings(s)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load budget data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveTemplate = useCallback(async (major: string, plannedCents: number) => {
    const updated = await putBudgetTemplate(major, plannedCents)
    setBudgetPlan((prev) => {
      const filtered = prev.filter((e) => !(e.major === major && e.month === null))
      return [...filtered, updated]
    })
  }, [])

  const saveOverride = useCallback(async (major: string, month: string, plannedCents: number) => {
    const updated = await putBudgetOverride(major, month, plannedCents)
    setBudgetPlan((prev) => {
      const filtered = prev.filter((e) => !(e.major === major && e.month === month))
      return [...filtered, updated]
    })
  }, [])

  return (
    <BudgetContext value={{ budgetPlan, settings, isLoading, error, refresh, saveTemplate, saveOverride }}>
      {children}
    </BudgetContext>
  )
}

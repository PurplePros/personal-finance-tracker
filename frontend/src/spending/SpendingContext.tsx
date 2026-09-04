import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchSpendingData, patchTransactionCategory } from '../api/client'
import type { CategoryTaxonomy, Transaction } from '../api/types'

export interface SpendingContextValue {
  transactions: Transaction[]
  categories: CategoryTaxonomy[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  patchCategory: (txnId: string, category: { major: string; subcategory: string } | null) => Promise<void>
}

const SpendingContext = createContext<SpendingContextValue | null>(null)

export function useSpending(): SpendingContextValue {
  const ctx = useContext(SpendingContext)
  if (!ctx) throw new Error('useSpending must be used inside SpendingProvider')
  return ctx
}

export function SpendingProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategoryTaxonomy[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchSpendingData()
      setTransactions(data.transactions)
      setCategories(data.categories)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load spending data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const patchCategory = useCallback(
    async (txnId: string, category: { major: string; subcategory: string } | null) => {
      const updated = await patchTransactionCategory(txnId, category)
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    },
    [],
  )

  return (
    <SpendingContext value={{ transactions, categories, isLoading, error, refresh, patchCategory }}>
      {children}
    </SpendingContext>
  )
}

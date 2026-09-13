import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  createManualTransaction,
  deleteManualTransaction,
  fetchSpendingData,
  patchTransactionCategory,
  patchTransactionNote,
  updateManualTransaction,
} from '../api/client'
import type { CategoryTaxonomy, Transaction } from '../api/types'

export interface ManualTransactionInput {
  institutionId: string
  name: string
  amountCents: number
  date: string
  major: string
  subcategory: string
  note?: string | null
}

export interface SpendingContextValue {
  transactions: Transaction[]
  categories: CategoryTaxonomy[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  patchCategory: (txnId: string, category: { major: string; subcategory: string } | null) => Promise<void>
  patchNote: (txnId: string, note: string | null) => Promise<void>
  addManualTransaction: (input: ManualTransactionInput) => Promise<void>
  editManualTransaction: (txnId: string, input: ManualTransactionInput) => Promise<void>
  removeManualTransaction: (txnId: string) => Promise<void>
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

  const patchNote = useCallback(async (txnId: string, note: string | null) => {
    const updated = await patchTransactionNote(txnId, note)
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  const addManualTransaction = useCallback(async (input: ManualTransactionInput) => {
    const created = await createManualTransaction({
      institution_id: input.institutionId,
      name: input.name,
      amount_cents: input.amountCents,
      date: input.date,
      category: { major: input.major, subcategory: input.subcategory },
      note: input.note,
    })
    setTransactions((prev) => [created, ...prev])
  }, [])

  const editManualTransaction = useCallback(async (txnId: string, input: ManualTransactionInput) => {
    const updated = await updateManualTransaction(txnId, {
      name: input.name,
      amount_cents: input.amountCents,
      date: input.date,
      category: { major: input.major, subcategory: input.subcategory },
      note: input.note,
    })
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  const removeManualTransaction = useCallback(async (txnId: string) => {
    await deleteManualTransaction(txnId)
    setTransactions((prev) => prev.filter((t) => t.id !== txnId))
  }, [])

  return (
    <SpendingContext value={{
      transactions, categories, isLoading, error, refresh,
      patchCategory, patchNote,
      addManualTransaction, editManualTransaction, removeManualTransaction,
    }}>
      {children}
    </SpendingContext>
  )
}

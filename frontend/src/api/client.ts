import type { Account, AppSettings, BudgetPlanEntry, CategoryTaxonomy, Institution, ManualInstitution, SyncResult, Transaction } from './types'

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchDashboardData(): Promise<{
  accounts: Account[]
  institutions: Institution[]
}> {
  const [accounts, institutions] = await Promise.all([
    requestJson<Account[]>('/api/accounts'),
    requestJson<Institution[]>('/api/institutions'),
  ])
  return { accounts, institutions }
}

export async function syncAccounts(): Promise<SyncResult[]> {
  return requestJson<SyncResult[]>('/api/sync', { method: 'POST' })
}

export async function createLinkToken(opts?: {
  itemId?: string
  institutionId?: string
}): Promise<string> {
  const body = opts?.itemId
    ? { item_id: opts.itemId }
    : opts?.institutionId
      ? { institution_id: opts.institutionId }
      : {}
  const result = await requestJson<{ link_token: string }>('/api/plaid/link-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return result.link_token
}

export async function exchangeToken(
  publicToken: string,
  institutionName: string,
): Promise<string> {
  const result = await requestJson<{ institution_id: string }>(
    '/api/plaid/exchange-token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken, institution_name: institutionName }),
    },
  )
  return result.institution_id
}

export async function fetchSpendingData(): Promise<{
  transactions: Transaction[]
  categories: CategoryTaxonomy[]
}> {
  const [transactions, categories] = await Promise.all([
    requestJson<Transaction[]>('/api/transactions'),
    requestJson<CategoryTaxonomy[]>('/api/categories'),
  ])
  return { transactions, categories }
}

export async function patchTransactionCategory(
  txnId: string,
  category: { major: string; subcategory: string } | null,
): Promise<Transaction> {
  return requestJson<Transaction>(`/api/transactions/${txnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })
}

export async function patchTransactionNote(
  txnId: string,
  note: string | null,
): Promise<Transaction> {
  return requestJson<Transaction>(`/api/transactions/${txnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
}

export async function fetchBudgetPlan(): Promise<BudgetPlanEntry[]> {
  return requestJson<BudgetPlanEntry[]>('/api/budget/plan')
}

export async function putBudgetTemplate(
  major: string,
  plannedCents: number,
): Promise<BudgetPlanEntry> {
  return requestJson<BudgetPlanEntry>(`/api/budget/plan/${encodeURIComponent(major)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planned_cents: plannedCents }),
  })
}

export async function putBudgetOverride(
  major: string,
  month: string,
  plannedCents: number,
): Promise<BudgetPlanEntry> {
  return requestJson<BudgetPlanEntry>(
    `/api/budget/plan/${encodeURIComponent(major)}/${month}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planned_cents: plannedCents }),
    },
  )
}

export async function fetchManualInstitutions(): Promise<ManualInstitution[]> {
  const institutions = await requestJson<Institution[]>('/api/institutions')
  return institutions
    .filter((i) => i.is_manual)
    .map((i) => ({ id: i.id, name: i.name, holder: i.holder, is_manual: true as const }))
}

export async function createManualInstitution(name: string, holder: string): Promise<ManualInstitution> {
  return requestJson<ManualInstitution>('/api/institutions/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, holder }),
  })
}

export async function deleteManualInstitution(id: string): Promise<void> {
  const response = await fetch(`/api/institutions/manual/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail ?? `Request failed with status ${response.status}`)
  }
}

export async function createManualTransaction(payload: {
  institution_id: string
  name: string
  amount_cents: number
  date: string
  category: { major: string; subcategory: string }
  note?: string | null
}): Promise<Transaction> {
  return requestJson<Transaction>('/api/transactions/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateManualTransaction(
  txnId: string,
  payload: {
    name: string
    amount_cents: number
    date: string
    category: { major: string; subcategory: string }
    note?: string | null
  },
): Promise<Transaction> {
  return requestJson<Transaction>(`/api/transactions/manual/${txnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteManualTransaction(txnId: string): Promise<void> {
  const response = await fetch(`/api/transactions/manual/${txnId}`, { method: 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail ?? `Request failed with status ${response.status}`)
  }
}

export async function fetchSettings(): Promise<AppSettings> {
  return requestJson<AppSettings>('/api/settings')
}

export async function patchSettings(catherineRatio: number): Promise<AppSettings> {
  return requestJson<AppSettings>('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catherine_ratio: catherineRatio }),
  })
}

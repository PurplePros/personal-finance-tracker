import type { Account, Institution, SyncResult } from './types'

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

export async function createLinkToken(itemId?: string): Promise<string> {
  const body = itemId ? { item_id: itemId } : {}
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

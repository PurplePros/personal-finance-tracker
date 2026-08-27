import type { Account, Institution } from './types'

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

export async function syncAccounts(): Promise<void> {
  await requestJson('/api/sync', { method: 'POST' })
}

/**
 * Pure derivation seam: turns raw API responses into the dashboard view model
 * (CAD-only filtering, sign-based asset/liability classification, totals,
 * institution grouping with Investment sub-grouping by product name).
 */
import type { Account, AccountType, Institution } from '../api/types'

const INCLUDED_CURRENCY = 'CAD'

export type Classification = 'asset' | 'liability'

export interface AccountView {
  id: string
  name: string
  type: AccountType
  balance: number
  classification: Classification
}

/** Investment accounts sharing one product name; two same-named TFSAs stay as two entries. */
export interface InvestmentProductGroup {
  productName: string
  subtotal: number
  accounts: AccountView[]
}

export interface InstitutionGroup {
  id: string
  name: string
  subtotal: number
  accounts: AccountView[]
  investments: InvestmentProductGroup[]
}

export interface DashboardViewModel {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  institutions: InstitutionGroup[]
}

/** Zero counts as an asset; only a strictly negative balance is a liability. */
function classify(balance: number): Classification {
  return balance < 0 ? 'liability' : 'asset'
}

function toAccountView(account: Account): AccountView {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance,
    classification: classify(account.balance),
  }
}

function groupInvestments(views: AccountView[]): InvestmentProductGroup[] {
  const groups: InvestmentProductGroup[] = []
  const byName = new Map<string, InvestmentProductGroup>()

  for (const view of views) {
    let group = byName.get(view.name)
    if (group === undefined) {
      group = { productName: view.name, subtotal: 0, accounts: [] }
      byName.set(view.name, group)
      groups.push(group)
    }
    group.accounts.push(view)
    group.subtotal += view.balance
  }

  return groups
}

/**
 * Included accounts are CAD and belong to one of the given institutions;
 * everything else is dropped from both the grouping and the totals, which
 * keeps institution subtotals reconciled to net worth.
 */
export function deriveDashboard(
  institutions: Institution[],
  accounts: Account[],
): DashboardViewModel {
  const included = accounts.filter(
    (account) => account.iso_currency_code === INCLUDED_CURRENCY,
  )

  const accountsByInstitution = new Map<string, Account[]>()
  for (const account of included) {
    const bucket = accountsByInstitution.get(account.institution_id)
    if (bucket === undefined) {
      accountsByInstitution.set(account.institution_id, [account])
    } else {
      bucket.push(account)
    }
  }

  let totalAssets = 0
  let totalLiabilities = 0
  const groups: InstitutionGroup[] = []

  for (const institution of institutions) {
    const own = accountsByInstitution.get(institution.id)
    if (own === undefined || own.length === 0) {
      continue
    }

    const nonInvestmentViews: AccountView[] = []
    const investmentViews: AccountView[] = []
    let subtotal = 0

    for (const account of own) {
      const view = toAccountView(account)
      subtotal += view.balance
      if (view.classification === 'liability') {
        totalLiabilities += -view.balance
      } else {
        totalAssets += view.balance
      }

      if (view.type === 'Investment') {
        investmentViews.push(view)
      } else {
        nonInvestmentViews.push(view)
      }
    }

    groups.push({
      id: institution.id,
      name: institution.name,
      subtotal,
      accounts: nonInvestmentViews,
      investments: groupInvestments(investmentViews),
    })
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    institutions: groups,
  }
}

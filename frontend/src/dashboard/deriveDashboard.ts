/**
 * `deriveDashboard` — the pure derivation seam for the Guru dashboard.
 *
 * It turns the raw API responses (`GET /api/institutions`, `GET /api/accounts`)
 * into the dashboard view model: CAD-only filtering, sign-based asset/liability
 * classification, totals, and grouping by institution (with `Investment`
 * accounts sub-grouped by product name). It has no I/O and no DOM dependency,
 * so it is unit-tested directly against fixtures.
 *
 * Domain rules follow the repo root `CONTEXT.md` and the v1 dashboard spec.
 */
import type { Account, AccountType, Institution } from '../api/types'

/** Currency counted and displayed in v1; everything else is excluded. */
const INCLUDED_CURRENCY = 'CAD'

/** Whether an account is held (asset) or owed (liability). */
export type Classification = 'asset' | 'liability'

/** A single account, prepared for display. Balances are in integer cents. */
export interface AccountView {
  id: string
  name: string
  type: AccountType
  /** Signed balance in cents (negative ⇒ owed). */
  balance: number
  classification: Classification
}

/**
 * `Investment` accounts sharing one registered product name (`Account.name`).
 * Two distinct same-named accounts (e.g. two TFSAs) stay as two entries here.
 */
export interface InvestmentProductGroup {
  productName: string
  /** Sum of the signed balances in this group, in cents. */
  subtotal: number
  accounts: AccountView[]
}

/** All of one institution's included accounts, grouped for display. */
export interface InstitutionGroup {
  id: string
  name: string
  /** Sum of the signed balances of every included account, in cents. */
  subtotal: number
  /** Non-investment accounts, in input order. */
  accounts: AccountView[]
  /** Investment accounts, sub-grouped by product name, in first-seen order. */
  investments: InvestmentProductGroup[]
}

/** The dashboard view model. All money fields are in integer cents. */
export interface DashboardViewModel {
  /** Sum of positive balances across included accounts. */
  totalAssets: number
  /** Magnitude of the negative balances across included accounts (`>= 0`). */
  totalLiabilities: number
  /** `totalAssets - totalLiabilities`; may be negative. */
  netWorth: number
  /** Institutions with at least one included account, in input order. */
  institutions: InstitutionGroup[]
}

/**
 * A balance is a liability only when strictly negative; a zero (or positive)
 * balance is an asset and contributes nothing / its full value to assets.
 */
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
      // First account of this product name — preserve first-seen order.
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
 * Derive the dashboard view model from raw institutions and accounts.
 *
 * Accounts are included only when their currency is CAD **and** they belong to
 * one of the given institutions; every other account is dropped from both the
 * grouped display and the totals, which keeps the institution subtotals
 * reconciled to net worth.
 */
export function deriveDashboard(
  institutions: Institution[],
  accounts: Account[],
): DashboardViewModel {
  const included = accounts.filter(
    (account) => account.iso_currency_code === INCLUDED_CURRENCY,
  )

  // Bucket the included accounts by institution for O(1) lookup per institution.
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
      continue // Omit institutions with no included accounts.
    }

    const nonInvestmentViews: AccountView[] = []
    const investmentViews: AccountView[] = []
    let subtotal = 0

    for (const account of own) {
      const view = toAccountView(account)
      subtotal += view.balance
      // Fold into totals via the single classification decision (classify()),
      // rather than re-testing the sign here.
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

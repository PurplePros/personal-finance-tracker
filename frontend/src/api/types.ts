/** Mirrors the Guru backend JSON API (`GET /api/institutions`, `GET /api/accounts`, `GET /api/transactions`, `GET /api/categories`). */

export type CurrencyCode = string

/** Registered products (RRSP, TFSA) are all `Investment`; the product name lives in `Account.name`. Manual accounts belong to Manual Institutions and carry no real balance. */
export type AccountType = 'Chequing' | 'Savings' | 'Credit Card' | 'Investment' | 'Manual'

export interface Institution {
  id: string
  name: string
  plaid_id: string | null
  plaid_item_id: string | null
  holder: string
  is_manual: boolean
}

/** A Manual Institution created in Settings for a provider Plaid doesn't support. */
export interface ManualInstitution {
  id: string
  name: string
  holder: string
  is_manual: true
}

export interface SyncResult {
  institution: string
  institution_id?: string
  status: 'ok' | 'error'
  error?: string
  error_code?: string
}

/** Who assigned the effective category: the holder (manual edit), Plaid with confidence >= MEDIUM, or Plaid below MEDIUM. */
export type CategorySource = 'user' | 'plaid' | 'plaid_low_confidence'

export interface Category {
  major: string
  subcategory: string | null
}

/** One entry from `GET /api/categories`. */
export interface CategoryTaxonomy {
  major: string
  subcategories: string[]
}

/** One entry from `GET /api/transactions`. Amount is integer cents; positive = spending outflow, negative = refund/credit. */
export interface Transaction {
  id: string
  account_id: string
  /** ISO date string: YYYY-MM-DD */
  date: string
  merchant_name: string | null
  name: string
  amount: number
  pending: boolean
  /** True when entered by hand (not synced from Plaid). */
  is_manual: boolean
  category: Category
  category_source: CategorySource
  is_spending: boolean
  note: string | null
}

/** One entry from `GET /api/budget/plan`. month is null for the global template. */
export interface BudgetPlanEntry {
  major: string
  month: string | null
  planned_cents: number
}

/** Application-level settings. */
export interface AppSettings {
  catherine_ratio: number
}

export interface Account {
  id: string
  name: string
  institution_id: string
  plaid_id: string
  type: AccountType
  /** Integer cents, not a float, to avoid rounding drift. Sign encodes asset (>= 0) vs liability (< 0). */
  balance: number
  iso_currency_code: CurrencyCode
}

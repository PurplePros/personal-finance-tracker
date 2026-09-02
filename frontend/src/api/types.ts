/** Mirrors the Guru backend JSON API (`GET /api/institutions`, `GET /api/accounts`). */

export type CurrencyCode = string

/** Registered products (RRSP, TFSA) are all `Investment`; the product name lives in `Account.name`. */
export type AccountType = 'Chequing' | 'Savings' | 'Credit Card' | 'Investment'

export interface Institution {
  id: string
  name: string
  plaid_id: string
  plaid_item_id: string | null
  holder: string
}

export interface SyncResult {
  institution: string
  institution_id?: string
  status: 'ok' | 'error'
  error?: string
  error_code?: string
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

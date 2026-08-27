/**
 * Types mirroring the Guru backend JSON API contract (the shapes returned by
 * `GET /api/institutions` and `GET /api/accounts`). Domain vocabulary follows
 * the repo root `CONTEXT.md`.
 *
 * PUR-7 builds against this contract using fixtures, so it needs no live
 * backend; PUR-8 wires these same types to the real API.
 */

/** ISO 4217 currency code, e.g. `"CAD"`, `"USD"` (Plaid `iso_currency_code`). */
export type CurrencyCode = string

/**
 * Coarse account classification (backend `AccountType`; see CONTEXT.md →
 * "Account Type"). Registered products (RRSP, TFSA) are all `Investment`; the
 * specific product name is carried by {@link Account.name}, not the type.
 */
export type AccountType = 'Chequing' | 'Savings' | 'Credit Card' | 'Investment'

/** Supported institution display names (backend `Institution` enum). */
export type InstitutionName = 'Wealthsimple' | 'Tangerine'

/** An institution as returned by `GET /api/institutions`. */
export interface Institution {
  id: string
  name: InstitutionName
  plaid_id: string
  holder: string
}

/** An account as returned by `GET /api/accounts`. */
export interface Account {
  id: string
  name: string
  institution_id: string
  plaid_id: string
  type: AccountType
  /**
   * Current balance in **integer minor units** (cents) of
   * {@link Account.iso_currency_code}. Integer, not a binary float, to avoid
   * float drift (per spec: represent money in minor units). The **sign**
   * encodes asset (`>= 0`) vs liability (`< 0`) — see CONTEXT.md → "Asset vs.
   * Liability".
   */
  balance: number
  /** ISO currency code (Plaid `iso_currency_code`), e.g. `"CAD"`. */
  iso_currency_code: CurrencyCode
}

/**
 * Fixture API responses for exercising {@link deriveDashboard} without a live
 * backend. Balances are in integer cents (see {@link Account.balance}).
 *
 * The main fixture mirrors the spec's "Further Notes": Wealthsimple + Tangerine
 * (holder "Catherine"), with an RRSP, two distinct same-named TFSAs, a USD
 * account (excluded), an overpaid credit card (asset edge case) and an
 * overdrawn chequing account (liability edge case).
 */
import type { Account, Institution } from '../api/types'

export const WEALTHSIMPLE: Institution = {
  id: 'inst-ws',
  name: 'Wealthsimple',
  plaid_id: 'plaid-inst-ws',
  holder: 'Catherine',
}

export const TANGERINE: Institution = {
  id: 'inst-tg',
  name: 'Tangerine',
  plaid_id: 'plaid-inst-tg',
  holder: 'Catherine',
}

export const institutions: Institution[] = [WEALTHSIMPLE, TANGERINE]

export const accounts: Account[] = [
  // --- Wealthsimple ---
  {
    id: 'acc-rrsp',
    name: 'RRSP',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-rrsp',
    type: 'Investment',
    balance: 500_000, // $5,000.00
    iso_currency_code: 'CAD',
  },
  {
    id: 'acc-tfsa-1',
    name: 'TFSA',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-tfsa-1',
    type: 'Investment',
    balance: 200_000, // $2,000.00
    iso_currency_code: 'CAD',
  },
  {
    // A second, distinct TFSA sharing the same product name — must stay separate.
    id: 'acc-tfsa-2',
    name: 'TFSA',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-tfsa-2',
    type: 'Investment',
    balance: 150_000, // $1,500.00
    iso_currency_code: 'CAD',
  },
  {
    // Non-CAD: excluded entirely from list and totals.
    id: 'acc-usd',
    name: 'USD Cash',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-usd',
    type: 'Investment',
    balance: 1_000_000, // $10,000.00 USD
    iso_currency_code: 'USD',
  },
  {
    // Overpaid credit card: positive balance ⇒ asset (edge case).
    id: 'acc-cc',
    name: 'WS Credit',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-cc',
    type: 'Credit Card',
    balance: 25_000, // +$250.00
    iso_currency_code: 'CAD',
  },
  // --- Tangerine ---
  {
    // Overdrawn chequing: negative balance ⇒ liability (edge case).
    id: 'acc-chq',
    name: 'Everyday Chequing',
    institution_id: TANGERINE.id,
    plaid_id: 'plaid-acc-chq',
    type: 'Chequing',
    balance: -12_000, // -$120.00
    iso_currency_code: 'CAD',
  },
  {
    id: 'acc-sav',
    name: 'Savings Account',
    institution_id: TANGERINE.id,
    plaid_id: 'plaid-acc-sav',
    type: 'Savings',
    balance: 800_000, // $8,000.00
    iso_currency_code: 'CAD',
  },
]

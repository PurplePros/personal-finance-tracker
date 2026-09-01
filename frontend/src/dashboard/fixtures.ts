/** Fixture API responses for exercising deriveDashboard without a live backend. Balances are integer cents. */
import type { Account, Institution } from '../api/types'

export const WEALTHSIMPLE: Institution = {
  id: 'inst-ws',
  name: 'Wealthsimple',
  plaid_id: 'plaid-inst-ws',
  plaid_item_id: null,
  holder: 'Catherine',
}

export const TANGERINE: Institution = {
  id: 'inst-tg',
  name: 'Tangerine',
  plaid_id: 'plaid-inst-tg',
  plaid_item_id: null,
  holder: 'Catherine',
}

export const institutions: Institution[] = [WEALTHSIMPLE, TANGERINE]

export const accounts: Account[] = [
  {
    id: 'acc-rrsp',
    name: 'RRSP',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-rrsp',
    type: 'Investment',
    balance: 500_000,
    iso_currency_code: 'CAD',
  },
  {
    id: 'acc-tfsa-1',
    name: 'TFSA',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-tfsa-1',
    type: 'Investment',
    balance: 200_000,
    iso_currency_code: 'CAD',
  },
  {
    // Same product name as acc-tfsa-1 but a distinct account — both must remain separate.
    id: 'acc-tfsa-2',
    name: 'TFSA',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-tfsa-2',
    type: 'Investment',
    balance: 150_000,
    iso_currency_code: 'CAD',
  },
  {
    id: 'acc-usd',
    name: 'USD Cash',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-usd',
    type: 'Investment',
    balance: 1_000_000,
    iso_currency_code: 'USD',
  },
  {
    // Positive balance on a credit card ⇒ asset.
    id: 'acc-cc',
    name: 'WS Credit',
    institution_id: WEALTHSIMPLE.id,
    plaid_id: 'plaid-acc-cc',
    type: 'Credit Card',
    balance: 25_000,
    iso_currency_code: 'CAD',
  },
  {
    // Negative balance on a chequing account ⇒ liability.
    id: 'acc-chq',
    name: 'Everyday Chequing',
    institution_id: TANGERINE.id,
    plaid_id: 'plaid-acc-chq',
    type: 'Chequing',
    balance: -12_000,
    iso_currency_code: 'CAD',
  },
  {
    id: 'acc-sav',
    name: 'Savings Account',
    institution_id: TANGERINE.id,
    plaid_id: 'plaid-acc-sav',
    type: 'Savings',
    balance: 800_000,
    iso_currency_code: 'CAD',
  },
]

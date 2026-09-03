/**
 * Fixture transactions for exercising deriveSpending without a live backend.
 * Amounts are integer cents; positive = spending outflow, negative = refund/credit.
 * Selected month: 2026-09.
 * Prior months for 3-month average: 2026-06, 2026-07, 2026-08.
 */
import type { Transaction } from '../api/types'

export const SELECTED_MONTH = '2026-09'

// September 2026 - spending transactions (is_spending: true)
export const SEP_GROCERIES: Transaction = {
  id: 'txn-sep-groc',
  account_id: 'acc-cc',
  date: '2026-09-02',
  merchant_name: 'Loblaws',
  amount: 8_500,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Groceries and personal items' },
  category_source: 'plaid',
  is_spending: true,
}

export const SEP_RESTAURANT: Transaction = {
  id: 'txn-sep-rest',
  account_id: 'acc-cc',
  date: '2026-09-05',
  merchant_name: 'Terroni',
  amount: 6_000,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Restaurants' },
  category_source: 'plaid_low_confidence',
  is_spending: true,
}

export const SEP_CLOTHING: Transaction = {
  id: 'txn-sep-clothing',
  account_id: 'acc-cc',
  date: '2026-09-10',
  merchant_name: 'SSENSE',
  amount: 25_000,
  pending: false,
  category: { major: 'Shopping', subcategory: 'Clothing' },
  category_source: 'user',
  is_spending: true,
}

// Refund in September (negative amount, is_spending: true - it nets the total)
export const SEP_REFUND: Transaction = {
  id: 'txn-sep-refund',
  account_id: 'acc-cc',
  date: '2026-09-12',
  merchant_name: 'SSENSE',
  amount: -5_000,
  pending: false,
  category: { major: 'Shopping', subcategory: 'Clothing' },
  category_source: 'user',
  is_spending: true,
}

// Transfer in September (is_spending: false) - excluded from totals/breakdown, present in list
export const SEP_TRANSFER: Transaction = {
  id: 'txn-sep-transfer',
  account_id: 'acc-cc',
  date: '2026-09-15',
  merchant_name: 'TD Bank',
  amount: 100_000,
  pending: false,
  category: { major: 'Finances', subcategory: 'Transfers' },
  category_source: 'plaid',
  is_spending: false,
}

// August 2026 - for 3-month average
export const AUG_GROCERIES: Transaction = {
  id: 'txn-aug-groc',
  account_id: 'acc-cc',
  date: '2026-08-02',
  merchant_name: 'Loblaws',
  amount: 9_000,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Groceries and personal items' },
  category_source: 'plaid',
  is_spending: true,
}

export const AUG_RESTAURANT: Transaction = {
  id: 'txn-aug-rest',
  account_id: 'acc-cc',
  date: '2026-08-10',
  merchant_name: 'Bar Isabel',
  amount: 7_500,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Restaurants' },
  category_source: 'plaid',
  is_spending: true,
}

// July 2026 - for 3-month average
export const JUL_GROCERIES: Transaction = {
  id: 'txn-jul-groc',
  account_id: 'acc-cc',
  date: '2026-07-03',
  merchant_name: 'Loblaws',
  amount: 8_000,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Groceries and personal items' },
  category_source: 'plaid',
  is_spending: true,
}

export const JUL_TRANSFER: Transaction = {
  id: 'txn-jul-transfer',
  account_id: 'acc-cc',
  date: '2026-07-05',
  merchant_name: 'TD Bank',
  amount: 50_000,
  pending: false,
  category: { major: 'Finances', subcategory: 'Transfers' },
  category_source: 'plaid',
  is_spending: false,
}

// June 2026 - for 3-month average
export const JUN_GROCERIES: Transaction = {
  id: 'txn-jun-groc',
  account_id: 'acc-cc',
  date: '2026-06-05',
  merchant_name: 'Loblaws',
  amount: 7_000,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Groceries and personal items' },
  category_source: 'plaid',
  is_spending: true,
}

// October 2026 - should be excluded when selected month is September
export const OCT_GROCERIES: Transaction = {
  id: 'txn-oct-groc',
  account_id: 'acc-cc',
  date: '2026-10-01',
  merchant_name: 'Loblaws',
  amount: 10_000,
  pending: false,
  category: { major: 'Food and personal items', subcategory: 'Groceries and personal items' },
  category_source: 'plaid',
  is_spending: true,
}

/** All transactions in the reference fixture. */
export const transactions: Transaction[] = [
  SEP_GROCERIES,
  SEP_RESTAURANT,
  SEP_CLOTHING,
  SEP_REFUND,
  SEP_TRANSFER,
  AUG_GROCERIES,
  AUG_RESTAURANT,
  JUL_GROCERIES,
  JUL_TRANSFER,
  JUN_GROCERIES,
  OCT_GROCERIES,
]

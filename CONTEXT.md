# Guru — Domain Glossary

Guru is a local, single-user personal finance tracker. It links financial
institutions via Plaid and shows a breakdown of accounts with total assets and
liabilities, plus a breakdown of credit-card spending by category over time.

## Terms

### Institution
A linked financial provider (e.g. Wealthsimple, Tangerine) whose accounts are
pulled in via Plaid. Holds the Plaid access token used to fetch its accounts.
An institution belongs to a **holder** (the human who owns the accounts).

### Account
A single financial account belonging to an Institution (e.g. a chequing
account, a TFSA, a credit card). Its human-facing product name lives in
`Account.name` (e.g. "TFSA", "RRSP", "Tangerine Savings Account"). Two accounts
under one institution may share the same product name (e.g. two distinct TFSAs)
— they are separate Accounts with distinct Plaid IDs.

### Account Type
A **coarse** classification of an Account, used only to reason about it
structurally — not to encode the specific registered product. The set:
`Chequing`, `Savings`, `Credit Card`, `Investment`. Registered accounts (RRSP,
TFSA) are `Investment`; the specific product name is carried by `Account.name`,
not by the type. Distinguishing RRSP vs TFSA is a tax concern, out of scope for
asset/liability totals. The registered-product distinction is surfaced in the
UI instead: within an institution, `Investment` accounts are shown under an
Investments section, sub-grouped by their product name (from `Account.name`).

### Balance
The **current** balance of an Account (Plaid `balances.current`), in the
account's own currency. This is the amount actually held or owed, and is what
totals are computed from. Refreshed on each sync.

### Currency
The Account's ISO currency code (Plaid `iso_currency_code`). For v1, only CAD
accounts are shown and counted; accounts in any other currency are excluded
entirely from the display and from totals.

### Asset vs. Liability
An Account is classified by the **sign of its balance**, not by its type: a
negative balance is a liability, a positive balance is an asset. (This makes an
overdrawn chequing account a liability and an overpaid credit card an asset,
without special-casing type.)

### Total Assets / Total Liabilities
The sum of positive balances (assets) and the sum of negative balances
(liabilities) across all included (CAD) accounts. **Net worth** is assets minus
liabilities.

### Sync
The act of fetching current account data (including balances) from Plaid for
every linked Institution and upserting it locally. Triggered by `POST /api/sync`
— on demand via a Refresh action, automatically every 10 minutes while the app
is open, and once on first load if no accounts exist yet. Sync also pulls
Transactions for every Institution.

## Spending

### Transaction
A single posted or pending money movement on an Account, pulled from Plaid (a
purchase, refund, fee, cash withdrawal, or payment). Belongs to one Account and
carries a merchant name, amount, date, and pending flag. Only Credit Card
accounts surface Transactions in v1.

### Spending
The net outflow over a period shown by the Spending view: purchases minus
refunds (a return reduces spending, so a period or Category can go negative).
Transfers and card payments are excluded (see Finances); bank fees and cash
withdrawals are included. Pending Transactions count.

### Category / Subcategory
The classification a Transaction is filed under. A **major Category** (e.g. Food
and drink, Shopping, Finances) contains **Subcategories** (e.g. Restaurants,
Groceries and personal items). Every major Category has an **Other**
Subcategory for things that belong to the major but to no specific Subcategory.
The set of Categories is fixed, not user-defined.

### Effective Category
The Category actually displayed for a Transaction, resolved by the first source
with an opinion: the holder's manual assignment wins; otherwise Plaid's
best-guess category, regardless of confidence. When Plaid's confidence is below
MEDIUM, the assignment is flagged as low-confidence in the UI. A manual
assignment is sticky and survives re-sync.

### Miscellaneous
A deliberate terminal Category for Transactions that genuinely fit no other
major Category. It is chosen, never a fallback for uncertainty.

### Finances
The major Category for money-management Transactions: bank fees and interest,
cash withdrawals, and Transfers. Fees and cash withdrawals count as Spending;
Transfers do not.

### Transfer
A Transaction that moves money rather than spending it (a credit-card payment,
or moving money between one's own accounts). Listed under Finances but never
counted in Spending. Ambiguous person-to-person transfers (e.g. Interac
e-Transfers) are out of scope until chequing/savings Accounts are added.

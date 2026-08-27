# Guru — Domain Glossary

Guru is a local, single-user personal finance tracker. It links financial
institutions via Plaid and shows a breakdown of accounts with total assets and
liabilities.

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
is open, and once on first load if no accounts exist yet.

# Derive transaction categories at read time

A Transaction's Effective Category is computed on read from its stored raw Plaid
signals plus an optional sticky user override — it is not stored as its own
column. Resolution order is: user override, then Plaid's category when confident
(confidence at or above MEDIUM), then Uncategorized. We persist only the raw
signals and the override, never the derived Category.

We chose this because our categorization rules and our Plaid-to-taxonomy mapping
will keep changing as we see real transaction data, our taxonomy is finer than
Plaid's, and the holder can manually recategorize. Deriving at read time means a
rule or mapping change re-flows every past Transaction instantly with no
backfill pass, and a stored guess can never drift from the current rules. The
user override is the only categorization we persist, so re-sync never clobbers
it.

## Considered options

Storing the computed auto-category on the Transaction row at sync time. Rejected:
every rule or mapping change would then require a re-categorization job over all
history, and stored guesses drift silently from the evolving rules.

## Consequences

The Transaction row must retain enough raw Plaid signal (category, confidence
level, merchant name, and raw name) to recompute the Effective Category.
Categorization runs on every read, which is cheap for a single-user local app.

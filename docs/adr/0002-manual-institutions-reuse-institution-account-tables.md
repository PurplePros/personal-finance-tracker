# Manual institutions reuse the Institution and Account tables

Manual institutions (providers not supported by Plaid) are represented as
Institution rows with nullable Plaid credentials and a paired Account row of
type `Manual`. This lets manual transactions flow through the existing query,
settlement, and holder-resolution paths unchanged.

## Considered options

**Separate table**: a `ManualInstitution` / `ManualTransaction` table pair,
merged into the transaction list at read time via UNION. Keeps the Plaid schema
untouched but duplicates query logic and complicates every callsite that reads
transactions.

**Sentinel values**: fill `plaid_access_token` and `plaid_id` with placeholder
strings (e.g. `"manual"`). Avoids a schema change but encodes a lie in
non-nullable fields and requires every Plaid callsite to guard against the
sentinel.

**Chosen approach**: nullable Plaid fields on Institution; `Manual` AccountType
on Account. Sync skips institutions with no access token naturally. Net worth
and the Accounts view exclude `Manual` accounts by type. No special-casing
needed in transaction queries or settlement logic.

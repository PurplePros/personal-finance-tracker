# Guru

A local, single-user personal finance tracker. It links financial
institutions via Plaid and shows a breakdown of accounts with total assets and
liabilities. See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) — Python packaging and runner
- Python 3.14.5 (uv will fetch it automatically; see `.python-version`)
- [Atlas](https://atlasgo.io/) CLI — database migrations (`atlas` on your `PATH`)

## Setup

```sh
uv sync              # install dependencies into .venv
make db-apply        # create/upgrade the SQLite DB (backend/data.db)
```

`make db-apply` runs the Atlas migrations in `migrations/` against the SQLite
database at `backend/data.db` (configured in `atlas.hcl`), which is the same
database the app reads by default.

## Configuration

Settings are read from environment variables or a `.env` file at the repo root
(see `backend/src/guru/api/settings/__init__.py`):

| Variable           | Default                   | Purpose                          |
| ------------------ | ------------------------- | -------------------------------- |
| `PLAID_CLIENT_ID`  | `""`                      | Plaid API client ID              |
| `PLAID_SECRET`     | `""`                      | Plaid API secret                 |
| `DATABASE_URL`     | `sqlite:///backend/data.db` | SQLAlchemy database URL        |

Example `.env`:

```
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
```

The Plaid client targets the **Production** environment.

## Running the app

```sh
uv run guru
```

This serves the FastAPI app on <http://127.0.0.1:8000>.

### Endpoints

- `GET  /api/institutions` — list linked institutions
- `GET  /api/institutions/{id}` — a single institution
- `GET  /api/institutions/{id}/accounts` — accounts for an institution
- `GET  /api/accounts` — list all accounts (each with `balance`,
  `iso_currency_code`, and `type`)
- `GET  /api/accounts/{id}` — a single account
- `POST /api/sync` — fetch current account data from Plaid for every linked
  institution and upsert it locally

Interactive API docs are available at <http://127.0.0.1:8000/docs>.

> **Note:** linking a new institution (the Plaid Link / public-token exchange
> flow) is not implemented yet, so `POST /api/sync` only has something to do
> once an `institution` row with a valid Plaid access token exists in the
> database. Until the link flow lands, the sync path is exercised end-to-end in
> the tests against a faked Plaid.

## Testing

```sh
uv run pytest
```

The tests drive the app through its real HTTP boundary (`TestClient` over
`create_app`) with Plaid faked via the `get_plaid_service` dependency
override — no Plaid credentials required.

## Linting and type checking

```sh
uv run ruff check backend    # lint
uv run ty check              # type check
```

## Database migrations

The schema is defined by the SQLAlchemy models under `backend/src/guru`; Atlas
diffs the models against the migration history.

```sh
make db-create     # generate a new migration from model changes
make db-apply      # apply pending migrations
make db-rollback   # roll back the last migration
make db-hash       # recompute migrations/atlas.sum after editing migrations
```

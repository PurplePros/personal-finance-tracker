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

**Backend:**

```sh
uv run guru
```

Starts the FastAPI server on <http://127.0.0.1:8000>. Interactive API docs at <http://127.0.0.1:8000/docs>.

**Frontend:**

```sh
cd frontend
npm install   # first time only
npm run dev
```

Opens the Vite dev server at <http://localhost:5173>, proxying API calls to the backend.

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

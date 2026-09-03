"""Shared fixtures for backend HTTP-seam tests.

Tests exercise the app through its real HTTP boundary: a `TestClient` over
`create_app`, with Plaid faked via the `get_plaid_service` dependency override.
"""

import uuid
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

from guru.api.app import create_app
from guru.api.dependencies import get_plaid_service
from guru.api.plaid import TransactionsSyncResult
from guru.db.models import Institution


class FakePlaidService:
    """In-memory stand-in for `PlaidService`, keyed by access token.

    Register accounts via `set_accounts`; errors via `set_error`.
    Link token and exchange token behaviour is configurable for Ticket B routes.
    """

    def __init__(self) -> None:
        self._accounts_by_token: dict[str, list[dict]] = {}
        self._errors_by_token: dict[str, Exception] = {}
        self._transactions_by_token: dict[str, TransactionsSyncResult] = {}
        self._transactions_errors_by_token: dict[str, Exception] = {}
        self._link_token: str = "link-token-sandbox"
        self._exchange_result: tuple[str, str] = ("access-token-new", "item-id-new")
        # Cursors passed to `fetch_transactions`, in call order, for assertions
        # that later Syncs request deltas rather than re-backfilling.
        self.fetch_cursors: list[str | None] = []

    def set_accounts(self, access_token: str, accounts: list[dict]) -> None:
        """Set the accounts that `list_accounts` returns for a token."""
        self._accounts_by_token[access_token] = accounts

    def set_error(self, access_token: str, exc: Exception) -> None:
        """Make `list_accounts` raise exc for the given access token."""
        self._errors_by_token[access_token] = exc

    def set_transactions_error(self, access_token: str, exc: Exception) -> None:
        """Make `fetch_transactions` raise exc for the given access token."""
        self._transactions_errors_by_token[access_token] = exc

    def set_transactions(
        self,
        access_token: str,
        added: list[dict] | None = None,
        modified: list[dict] | None = None,
        removed: list[str] | None = None,
    ) -> None:
        """Program the delta batches `fetch_transactions` returns for a token.

        Reprogram between `POST /api/sync` calls to simulate later-sync deltas,
        the way `set_accounts` is reprogrammed across syncs.
        """
        self._transactions_by_token[access_token] = TransactionsSyncResult(
            added=added or [],
            modified=modified or [],
            removed=removed or [],
            next_cursor="cursor-next",
        )

    def set_link_token(self, link_token: str) -> None:
        """Set the link_token that `create_link_token` returns."""
        self._link_token = link_token

    def set_exchange_result(self, access_token: str, item_id: str) -> None:
        """Set the (access_token, item_id) that `exchange_public_token` returns."""
        self._exchange_result = (access_token, item_id)

    def list_accounts(self, access_token: str) -> list[dict]:
        """Return the faked accounts registered for the given access token."""
        if access_token in self._errors_by_token:
            raise self._errors_by_token[access_token]
        return self._accounts_by_token.get(access_token, [])

    def fetch_transactions(
        self, access_token: str, cursor: str | None = None
    ) -> TransactionsSyncResult:
        """Return the delta batches programmed for the given access token."""
        self.fetch_cursors.append(cursor)
        if access_token in self._transactions_errors_by_token:
            raise self._transactions_errors_by_token[access_token]
        return self._transactions_by_token.get(
            access_token,
            TransactionsSyncResult(
                added=[], modified=[], removed=[], next_cursor="cursor-next"
            ),
        )

    def create_link_token(self, access_token: str | None = None) -> str:
        """Return the configured link token."""
        return self._link_token

    def exchange_public_token(self, public_token: str) -> tuple[str, str]:
        """Return the configured (access_token, item_id)."""
        return self._exchange_result


@pytest.fixture
def fake_plaid() -> FakePlaidService:
    """Provide a fresh fake Plaid service for a test to program."""
    return FakePlaidService()


@pytest.fixture
def app(tmp_path, fake_plaid: FakePlaidService) -> Iterator[FastAPI]:
    """Create the app over a temp SQLite DB with Plaid faked."""
    db_url = f"sqlite:///{tmp_path / 'test.db'}"
    app = create_app(db_url=db_url)
    SQLModel.metadata.create_all(app.state.engine)
    app.dependency_overrides[get_plaid_service] = lambda: fake_plaid
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    """Provide a TestClient bound to the configured app."""
    return TestClient(app)


@pytest.fixture
def seed_institution(app: FastAPI):
    """Return a factory that inserts an Institution and returns it."""

    def _seed(
        name: str = "Wealthsimple",
        access_token: str = "access-token-1",
        plaid_item_id: str | None = None,
    ) -> Institution:
        institution = Institution(
            name=name,
            plaid_access_token=access_token,
            plaid_id=f"ins_{uuid.uuid4().hex[:8]}",
            plaid_item_id=plaid_item_id,
            holder="Alice",
        )
        with Session(app.state.engine) as session:
            session.add(institution)
            session.commit()
            session.refresh(institution)
        return institution

    return _seed

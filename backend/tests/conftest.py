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
from guru.db.models import Institution


class FakePlaidService:
    """In-memory stand-in for `PlaidService`, keyed by access token.

    Register the accounts a token should return via `set_accounts`; `sync_all`
    then reads them exactly as it would read a real `accounts_get` response.
    """

    def __init__(self) -> None:
        self._accounts_by_token: dict[str, list[dict]] = {}

    def set_accounts(self, access_token: str, accounts: list[dict]) -> None:
        """Set the accounts that `list_accounts` returns for a token."""
        self._accounts_by_token[access_token] = accounts

    def list_accounts(self, access_token: str) -> list[dict]:
        """Return the faked accounts registered for the given access token."""
        return self._accounts_by_token.get(access_token, [])


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
    ) -> Institution:
        institution = Institution(
            name=name,
            plaid_access_token=access_token,
            plaid_id=f"ins_{uuid.uuid4().hex[:8]}",
            holder="Alice",
        )
        with Session(app.state.engine) as session:
            session.add(institution)
            session.commit()
            session.refresh(institution)
        return institution

    return _seed

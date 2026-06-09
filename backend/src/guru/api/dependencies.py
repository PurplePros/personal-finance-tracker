from collections.abc import Generator

from fastapi import Request
from sqlmodel import Session

from guru.api.plaid import PlaidService
from guru.api.settings import Settings


def get_session(request: Request) -> Generator[Session, None, None]:
    with Session(request.app.state.engine) as session:
        yield session


def get_plaid_service() -> PlaidService:
    settings = Settings()
    return PlaidService.default(settings.plaid_client_id, settings.plaid_secret)

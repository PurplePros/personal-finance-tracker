import uuid
from typing import List

from sqlmodel import Session

from guru.db.models import Account
from guru.db.repository import AccountRepository


def list_accounts(session: Session) -> List[Account]:
    """Return all accounts ordered by name."""
    return AccountRepository().list(session)


def get_account(session: Session, id: uuid.UUID) -> Account | None:
    """Return a single account by ID, or None."""
    return AccountRepository().get(session, id)


def list_accounts_by_institution(
    session: Session, institution_id: uuid.UUID
) -> List[Account]:
    """Return all accounts for a given institution ordered by name."""
    return AccountRepository().list_by_institution(session, institution_id)

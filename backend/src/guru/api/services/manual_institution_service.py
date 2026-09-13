"""Service layer for manual institutions (non-Plaid providers).

A manual institution owns exactly one Manual Account, created alongside it.
The account always has balance=0, iso_currency_code=CAD, and type=Manual.
"""

import uuid
from decimal import Decimal

from sqlmodel import Session, select

from guru.api.models import AccountType
from guru.db.models import Account, Institution, Transaction


class HasTransactionsError(ValueError):
    """Raised when deleting a manual institution that still has transactions."""


def create_manual_institution(session: Session, name: str, holder: str) -> dict:
    """Create a Manual Institution and its paired Manual Account.

    Returns the serialized institution dict.
    """
    institution = Institution(name=name, holder=holder)
    session.add(institution)
    session.flush()  # populate institution.id before creating the account

    account = Account(
        name=name,
        institution_id=institution.id,
        type=AccountType.MANUAL,
        balance=Decimal("0"),
        iso_currency_code="CAD",
    )
    session.add(account)
    session.commit()
    session.refresh(institution)
    return _serialize(institution)


def delete_manual_institution(session: Session, institution_id: uuid.UUID) -> bool:
    """Delete a Manual institution and its paired account(s).

    Returns True on success, False if not found.
    Raises HasTransactionsError if any account under this institution has transactions.
    """
    institution = session.get(Institution, institution_id)
    if institution is None or not institution.is_manual:
        return False

    accounts = session.exec(
        select(Account).where(Account.institution_id == institution_id)
    ).all()

    for account in accounts:
        has_txns = session.exec(
            select(Transaction).where(Transaction.account_id == account.id).limit(1)
        ).first()
        if has_txns is not None:
            raise HasTransactionsError(
                f"Institution {institution_id} has transactions; delete them first"
            )

    for account in accounts:
        session.delete(account)

    session.delete(institution)
    session.commit()
    return True


def get_manual_account_id(session: Session, institution_id: uuid.UUID) -> uuid.UUID | None:
    """Return the Manual Account id for a Manual Institution, or None."""
    account = session.exec(
        select(Account).where(
            Account.institution_id == institution_id,
            Account.type == AccountType.MANUAL,
        )
    ).first()
    return account.id if account is not None else None


def _serialize(institution: Institution) -> dict:
    return {
        "id": str(institution.id),
        "name": institution.name,
        "holder": institution.holder,
        "is_manual": True,
    }

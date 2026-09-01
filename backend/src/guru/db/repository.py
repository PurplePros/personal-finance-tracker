import uuid
from abc import ABC, abstractmethod
from typing import Generic, List, TypeVar

from sqlmodel import Session, select

from guru.db.models import Account, Institution

T = TypeVar("T")


class Repository(ABC, Generic[T]):
    @abstractmethod
    def list(self, session: Session) -> List[T]:
        """Return all entities."""

    @abstractmethod
    def get(self, session: Session, id: uuid.UUID) -> T | None:
        """Return the entity with the given id, or None."""


class AccountRepository(Repository[Account]):
    def list(self, session: Session) -> List[Account]:
        """Return all accounts ordered by name."""
        stmt = select(Account).order_by(Account.name)
        return list(session.exec(stmt).all())

    def get(self, session: Session, id: uuid.UUID) -> Account | None:
        """Return the account with the given id, or None."""
        return session.get(Account, id)

    def list_by_institution(
        self, session: Session, institution_id: uuid.UUID
    ) -> List[Account]:
        """Return all accounts for the given institution, ordered by name."""
        stmt = (
            select(Account)
            .where(Account.institution_id == institution_id)
            .order_by(Account.name)
        )
        return list(session.exec(stmt).all())


class InstitutionRepository(Repository[Institution]):
    def list(self, session: Session) -> List[Institution]:
        """Return all institutions ordered by name."""
        stmt = select(Institution).order_by(Institution.name)
        return list(session.exec(stmt).all())

    def get(self, session: Session, id: uuid.UUID) -> Institution | None:
        """Return the institution with the given id, or None."""
        return session.get(Institution, id)

    def get_by_item_id(self, session: Session, item_id: str) -> Institution | None:
        """Return the institution whose Plaid item_id matches, or None."""
        stmt = select(Institution).where(Institution.plaid_item_id == item_id)
        return session.exec(stmt).first()

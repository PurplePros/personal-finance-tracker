import uuid
from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from sqlmodel import Session, select

from guru.db.models import Account, Institution

T = TypeVar("T")

class Repository(ABC, Generic[T]):
    @abstractmethod
    def list(self, session: Session) -> list[T]:
        """Return all entities."""

    @abstractmethod
    def get(self, session: Session, id: uuid.UUID) -> T | None:
        """Return the entity with the given id, or None."""


class AccountRepository(Repository[Account]):
    def list(self, session: Session) -> list[Account]:
        """Return all accounts ordered by name."""
        stmt = select(Account).order_by(Account.name)
        return list(session.exec(stmt).all())

    def get(self, session: Session, id: uuid.UUID) -> Account | None:
        """Return the account with the given id, or None."""
        return session.get(Account, id)


class InstitutionRepository(Repository[Institution]):
    def list(self, session: Session) -> list[Institution]:
        """Return all institutions ordered by name."""
        stmt = select(Institution).order_by(Institution.name)
        return list(session.exec(stmt).all())

    def get(self, session: Session, id: uuid.UUID) -> Institution | None:
        """Return the institution with the given id, or None."""
        return session.get(Institution, id)

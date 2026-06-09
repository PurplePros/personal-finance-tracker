import uuid

from sqlalchemy.orm import declared_attr
from sqlmodel import SQLModel, Field

import guru.api.models as guru


class BaseSQLModel(SQLModel):
    """Base model providing a UUID primary key and automatic table naming."""

    __abstract__ = True

    id: uuid.UUID = Field(
        default_factory=uuid.uuid7,
        primary_key=True,
        description="Primary key, auto-generated UUIDv7",
    )

    @declared_attr.directive
    def __tablename__(cls) -> str:
        return cls.__name__.lower()

class Institution(BaseSQLModel, table=True):
    """A linked financial institution storing its Plaid credentials."""

    name: guru.Institution = Field(min_length=1, description="Display name of the institution")
    plaid_access_token: str = Field(min_length=1, description="Plaid API access token for this institution")
    plaid_id: str = Field(min_length=1, description="Plaid institution ID")
    holder: str = Field(min_length=1, description="Name of the account holder")

class Account(BaseSQLModel, table=True):
    """A financial account belonging to a linked institution."""

    name: str = Field(min_length=1, description="Account display name")
    institution_id: uuid.UUID = Field(foreign_key="institution.id", description="Foreign key to the parent Institution")
    plaid_id: str = Field(description="Plaid account ID")
    type: guru.AccountType = Field(description="Savings, Chequing, or Credit Card")

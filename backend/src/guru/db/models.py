import uuid
from decimal import Decimal

from pydantic import field_serializer
from sqlalchemy.orm import declared_attr
from sqlmodel import Field, SQLModel

import guru.api.models as guru


class BaseSQLModel(SQLModel):
    """Base model providing a UUID primary key and automatic table naming."""

    __abstract__ = True

    id: uuid.UUID = Field(
        default_factory=uuid.uuid7,
        primary_key=True,
        description="Primary key, auto-generated UUIDv7",
    )

    @declared_attr  # type: ignore
    def __tablename__(cls) -> str:  # noqa: N805
        return cls.__name__.lower()


class Institution(BaseSQLModel, table=True):
    """A linked financial institution storing its Plaid credentials."""

    name: guru.Institution = Field(
        min_length=1, description="Display name of the institution"
    )
    plaid_access_token: str = Field(
        min_length=1, description="Plaid API access token for this institution"
    )
    plaid_id: str = Field(min_length=1, description="Plaid institution ID")
    holder: str = Field(min_length=1, description="Name of the account holder")


class Account(BaseSQLModel, table=True):
    """A financial account belonging to a linked institution."""

    name: str = Field(min_length=1, description="Account display name")
    institution_id: uuid.UUID = Field(
        foreign_key="institution.id",
        description="Foreign key to the parent Institution",
    )
    plaid_id: str = Field(description="Plaid account ID")
    type: guru.AccountType = Field(
        description="Coarse account type (see AccountType)"
    )
    balance: Decimal = Field(
        max_digits=20,
        decimal_places=2,
        description="Current balance (Plaid balances.current) in account currency",
    )
    iso_currency_code: str = Field(
        min_length=1,
        description="ISO currency code of the account (Plaid iso_currency_code)",
    )

    @field_serializer("balance")
    def _serialize_balance(self, value: Decimal) -> float:
        """Emit balance as a JSON number. Storage stays exact Decimal."""
        return float(value)

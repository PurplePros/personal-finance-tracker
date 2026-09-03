import datetime
import uuid
from decimal import Decimal

from pydantic import field_serializer
from sqlalchemy.orm import declared_attr
from sqlmodel import Field, SQLModel

from guru.api.models import AccountType, PlaidConfidence


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

    name: str = Field(min_length=1, description="Display name of the institution")
    plaid_access_token: str = Field(
        min_length=1, description="Plaid API access token for this institution"
    )
    plaid_id: str = Field(min_length=1, description="Plaid institution ID")
    # item_id returned by Plaid on token exchange; used to re-authenticate
    # (update mode) when a token breaks.
    plaid_item_id: str | None = Field(
        default=None, description="Plaid item ID for this connection"
    )
    holder: str = Field(default="", description="Name of the account holder")
    # Opaque cursor Plaid returns after each transaction sync; null before first sync.
    transactions_cursor: str | None = Field(
        default=None, description="Plaid transactions sync cursor for delta fetches"
    )


class Account(BaseSQLModel, table=True):
    """A financial account belonging to a linked institution."""

    name: str = Field(min_length=1, description="Account display name")
    institution_id: uuid.UUID = Field(
        foreign_key="institution.id",
        description="Foreign key to the parent Institution",
    )
    plaid_id: str = Field(description="Plaid account ID")
    type: AccountType = Field(
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
    def _serialize_balance(self, value: Decimal) -> int:
        """Emit balance as integer cents (API contract); Plaid stores dollars."""
        return int(value * 100)


class Transaction(BaseSQLModel, table=True):
    """A single posted or pending money movement on a Credit Card Account.

    Stores only the raw Plaid signals needed to recompute Effective Category at
    read time (ADR 0001). No derived category column is stored.

    Amount sign follows Plaid: positive = outflow (purchase/fee), negative =
    inflow (refund/credit). Stored as Decimal; emitted as integer cents over
    the API.
    """

    account_id: uuid.UUID = Field(
        foreign_key="account.id",
        description="Credit Card Account this transaction belongs to",
    )
    plaid_transaction_id: str = Field(
        unique=True,
        description="Plaid transaction ID; used as the upsert key on sync",
    )
    # Links a posted transaction back to the pending one it replaced.
    pending_transaction_id: str | None = Field(
        default=None,
        description="Plaid ID of the pending transaction this posting replaced",
    )

    # Raw PFC signals for read-time Effective Category resolution.
    plaid_primary_category: str | None = Field(
        default=None,
        description="Plaid personal_finance_category.primary (e.g. FOOD_AND_DRINK)",
    )
    plaid_detailed_category: str | None = Field(
        default=None,
        description="Plaid personal_finance_category.detailed (e.g. FOOD_AND_DRINK_RESTAURANTS)",
    )
    plaid_confidence: PlaidConfidence | None = Field(
        default=None,
        description="Plaid personal_finance_category.confidence_level",
    )

    merchant_name: str | None = Field(
        default=None, description="Merchant name as enriched by Plaid"
    )
    name: str = Field(
        min_length=1, description="Raw transaction name as returned by Plaid"
    )
    amount: Decimal = Field(
        max_digits=20,
        decimal_places=4,
        description="Transaction amount in account currency (positive = outflow)",
    )
    date: datetime.date = Field(description="Posted or expected posting date")
    pending: bool = Field(default=False, description="True while the charge is pending")

    # Sticky manual category override set by the holder via PATCH. Both fields
    # are null when no override exists; both are set together when one does.
    user_category_major: str | None = Field(
        default=None, description="Holder's manual major Category override"
    )
    user_category_subcategory: str | None = Field(
        default=None, description="Holder's manual Subcategory override"
    )

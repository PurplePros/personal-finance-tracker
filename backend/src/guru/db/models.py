import datetime
import uuid
from decimal import Decimal

from pydantic import field_serializer
from sqlalchemy import CheckConstraint, Index
from sqlalchemy.orm import declared_attr
from sqlmodel import Field, SQLModel

from guru.api.models import AccountType, PlaidConfidence, PlaidPFCSignal, UserCategory


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class BaseSQLModel(SQLModel):
    """Base model with UUID PK, auto table naming, and audit timestamps."""

    __abstract__ = True

    id: uuid.UUID = Field(
        default_factory=uuid.uuid7,
        primary_key=True,
        description="Primary key, auto-generated UUIDv7",
    )
    created_at: datetime.datetime = Field(
        default_factory=_now,
        sa_column_kwargs={"nullable": False},
        description="UTC timestamp when this row was first inserted",
    )
    updated_at: datetime.datetime = Field(
        default_factory=_now,
        sa_column_kwargs={"nullable": False, "onupdate": _now},
        description="UTC timestamp of the last update to this row",
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

    __table_args__ = (
        # Enforces that user_category is always set or cleared atomically.
        CheckConstraint(
            "(user_category_major IS NULL) = (user_category_subcategory IS NULL)",
            name="ck_transaction_user_category_paired",
        ),
        # GET /api/transactions filters by account; without this every query is
        # a full table scan (SQLite does not auto-index FK columns).
        Index("ix_transaction_account_id", "account_id"),
        # Sync stores pending_transaction_id so a posted transaction can be
        # traced back to the pending row it replaced. Indexed for the future
        # lookup that will carry a holder's manual override forward across the
        # pending -> posted transition; the transition itself is applied as-is.
        Index("ix_transaction_pending_transaction_id", "pending_transaction_id"),
    )

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
        description="Plaid personal_finance_category.detailed (e.g. RESTAURANTS)",
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
        decimal_places=2,
        description="Transaction amount in account currency (positive = outflow)",
    )
    date: datetime.date = Field(description="Posted or expected posting date")
    pending: bool = Field(default=False, description="True while the charge is pending")

    # Sticky manual category override set by the holder via PATCH. Both fields
    # are null when no override exists; both are set together when one does.
    # The DB CHECK constraint ck_transaction_user_category_paired enforces atomicity.
    user_category_major: str | None = Field(
        default=None, description="Holder's manual major Category override"
    )
    user_category_subcategory: str | None = Field(
        default=None, description="Holder's manual Subcategory override"
    )

    @property
    def pfc_signal(self) -> PlaidPFCSignal:
        """The three Plaid PFC fields bundled for the categorization resolver."""
        return PlaidPFCSignal(
            self.plaid_primary_category,
            self.plaid_detailed_category,
            self.plaid_confidence,
        )

    @property
    def user_category(self) -> UserCategory | None:
        """The holder's manual category override, or None if no override is set."""
        if self.user_category_major is None or self.user_category_subcategory is None:
            return None
        return UserCategory(self.user_category_major, self.user_category_subcategory)

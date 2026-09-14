import datetime
import uuid
from decimal import Decimal

from pydantic import field_serializer
from sqlalchemy import CheckConstraint, Index, text
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
    """A financial institution. Two kinds: Plaid-linked (has plaid_access_token)
    and Manual (plaid_access_token is None). Manual institutions are created by
    the holder in Settings for providers Plaid doesn't support; their transactions
    are entered by hand (see ADR 0002).
    """

    name: str = Field(min_length=1, description="Display name of the institution")
    plaid_access_token: str | None = Field(
        default=None, description="Plaid API access token; None for manual institutions"
    )
    plaid_id: str | None = Field(
        default=None, description="Plaid institution ID; None for manual institutions"
    )
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

    @property
    def is_manual(self) -> bool:
        return self.plaid_access_token is None


class Account(BaseSQLModel, table=True):
    """A financial account belonging to a linked institution."""

    name: str = Field(min_length=1, description="Account display name")
    institution_id: uuid.UUID = Field(
        foreign_key="institution.id",
        description="Foreign key to the parent Institution",
    )
    plaid_id: str | None = Field(
        default=None, description="Plaid account ID; None for Manual accounts"
    )
    type: AccountType = Field(description="Coarse account type (see AccountType)")
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
    """A single posted or pending money movement on a Credit Card or Chequing Account.

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
        description="Credit Card or Chequing Account this transaction belongs to",
    )
    # Null for manual transactions (no Plaid source). SQLite UNIQUE allows
    # multiple NULLs (NULL != NULL), so manual transactions don't collide.
    plaid_transaction_id: str | None = Field(
        default=None,
        unique=True,
        description="Plaid transaction ID; null for manual transactions",
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
    note: str | None = Field(
        default=None, description="Free-text annotation added by the holder"
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


class BudgetPlan(BaseSQLModel, table=True):
    """A planned spending amount for a major category.

    When ``month`` is None, the row is the global template that applies to any
    month without an explicit override. When ``month`` is set (ISO YYYY-MM), the
    row overrides the template for exactly that month. The unique constraint
    prevents duplicate (major, month) pairs.
    """

    __tablename__ = "budget_plan"  # type: ignore[assignment]
    __table_args__ = (
        # Enforces uniqueness for month-specific overrides (month IS NOT NULL).
        # SQLite treats NULL != NULL in UNIQUE constraints, so this index alone
        # would not prevent two template rows for the same major. The service
        # layer's SELECT-then-upsert pattern guards the template slot instead.
        Index(
            "uq_budget_plan_major_month",
            "major",
            "month",
            unique=True,
            sqlite_where=text("month IS NOT NULL"),
        ),
    )

    major: str = Field(min_length=1, description="Major spending category name")
    month: str | None = Field(
        default=None,
        description="ISO YYYY-MM for a month-specific override, or null for the template",  # noqa: E501
    )
    planned_cents: int = Field(description="Planned amount in cents (CAD)")


class AppSettings(SQLModel, table=True):
    """Key-value store for application-level settings.

    Intentionally minimal: no audit timestamps, no UUID PK, because there are
    only a handful of well-known keys and they are never deleted.
    """

    __tablename__ = "app_settings"  # type: ignore[assignment]

    key: str = Field(primary_key=True, description="Setting key")
    value: str = Field(description="Setting value (serialized as text)")

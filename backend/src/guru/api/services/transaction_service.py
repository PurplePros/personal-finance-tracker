import datetime
import uuid
from decimal import Decimal

from sqlmodel import Session, col, select

from guru.api.categorization import ResolvedCategory, validate_user_category
from guru.api.models import SPENDING_ACCOUNT_TYPES, AccountType, UserCategory
from guru.db.models import Account, Transaction

# First Sync backfills roughly 13 months; the read endpoint defaults to the
# same window so the frontend sees everything a fresh Sync pulled in.
_DEFAULT_WINDOW = datetime.timedelta(days=397)


def _default_range() -> tuple[datetime.date, datetime.date]:
    """The default (start, end) date range: the last ~13 months through today."""
    today = datetime.date.today()
    return today - _DEFAULT_WINDOW, today


def list_transactions(
    session: Session,
    start: datetime.date | None = None,
    end: datetime.date | None = None,
) -> list[dict]:
    """Return CAD spending transactions in [start, end], newest first.

    Includes Credit Card, Chequing, and Manual accounts. Savings and Investment
    accounts are excluded. Defaults to the last ~13 months.
    """
    default_start, default_end = _default_range()
    start = start or default_start
    end = end or default_end

    rows = session.exec(
        select(Transaction)
        .join(Account)
        .where(
            Account.type.in_(list(SPENDING_ACCOUNT_TYPES)),
            Account.iso_currency_code == "CAD",
            col(Transaction.date) >= start,
            col(Transaction.date) <= end,
        )
        .order_by(col(Transaction.date).desc())
    ).all()

    return [_serialize(txn) for txn in rows]


class InvalidCategoryError(ValueError):
    """Raised when a category (major, subcategory) pair is not in the taxonomy."""


class NotManualTransactionError(ValueError):
    """Raised when a mutating operation targets a Plaid (non-manual) transaction."""


_UNSET = object()


def patch_transaction(
    session: Session,
    txn_id: uuid.UUID,
    category: UserCategory | None | object = _UNSET,
    note: str | None | object = _UNSET,
) -> dict | None:
    """Set or clear category/note overrides on a Transaction.

    Either field may be omitted (pass _UNSET or simply don't pass it) to leave
    the existing value unchanged. Returns the serialized Transaction on success,
    or None if not found. Raises InvalidCategoryError for invalid categories.
    """
    if category is not _UNSET and category is not None:
        cat = category  # type: ignore[assignment]
        if not validate_user_category(cat.major, cat.subcategory):
            raise InvalidCategoryError(
                f"Category ({cat.major!r}, {cat.subcategory!r}) not in taxonomy"
            )

    txn = session.get(Transaction, txn_id)
    if txn is None:
        return None

    if category is not _UNSET:
        if category is not None:
            cat = category  # type: ignore[assignment]
            txn.user_category_major = cat.major
            txn.user_category_subcategory = cat.subcategory
        else:
            txn.user_category_major = None
            txn.user_category_subcategory = None

    if note is not _UNSET:
        txn.note = note if note else None  # type: ignore[assignment]

    session.commit()
    session.refresh(txn)
    return _serialize(txn)


def patch_transaction_category(
    session: Session,
    txn_id: uuid.UUID,
    category: UserCategory | None,
) -> dict | None:
    """Set or clear the user_category override on a Transaction.

    Returns the serialized Transaction on success, or None if not found.
    Raises InvalidCategoryError if category is not in the taxonomy.
    """
    return patch_transaction(session, txn_id, category=category)


def create_manual_transaction(
    session: Session,
    account_id: uuid.UUID,
    name: str,
    amount_cents: int,
    date: datetime.date,
    category: UserCategory,
    note: str | None = None,
) -> dict:
    """Create a manual transaction on a Manual-type account.

    amount_cents follows Plaid sign: positive = outflow (spending), negative = inflow.
    category is required - manual transactions have no Plaid signals to fall back on.
    Raises ValueError if account_id is not a Manual account or category is invalid.
    """
    account = session.get(Account, account_id)
    if account is None or account.type != AccountType.MANUAL:
        raise ValueError(f"account {account_id} is not a Manual account")

    if not validate_user_category(category.major, category.subcategory):
        raise InvalidCategoryError(
            f"Category ({category.major!r}, {category.subcategory!r}) not in taxonomy"
        )

    txn = Transaction(
        account_id=account_id,
        name=name,
        amount=Decimal(amount_cents) / 100,
        date=date,
        pending=False,
        user_category_major=category.major,
        user_category_subcategory=category.subcategory,
        note=note or None,
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)
    return _serialize(txn)


def update_manual_transaction(
    session: Session,
    txn_id: uuid.UUID,
    name: str,
    amount_cents: int,
    date: datetime.date,
    category: UserCategory,
    note: str | None = None,
) -> dict | None:
    """Replace all mutable fields on a manual transaction.

    Returns the updated transaction dict, None if not found.
    Raises NotManualTransactionError if txn_id refers to a Plaid transaction.
    Raises InvalidCategoryError if the category is not in the taxonomy.
    """
    txn = session.get(Transaction, txn_id)
    if txn is None:
        return None
    if txn.plaid_transaction_id is not None:
        raise NotManualTransactionError(
            f"Transaction {txn_id} is a Plaid transaction and cannot be fully edited"
        )
    if not validate_user_category(category.major, category.subcategory):
        raise InvalidCategoryError(
            f"Category ({category.major!r}, {category.subcategory!r}) not in taxonomy"
        )

    txn.name = name
    txn.amount = Decimal(amount_cents) / 100
    txn.date = date
    txn.user_category_major = category.major
    txn.user_category_subcategory = category.subcategory
    txn.note = note or None
    session.commit()
    session.refresh(txn)
    return _serialize(txn)


def delete_manual_transaction(session: Session, txn_id: uuid.UUID) -> bool:
    """Delete a manual transaction.

    Returns True on success, False if not found.
    Raises NotManualTransactionError if txn_id refers to a Plaid transaction.
    """
    txn = session.get(Transaction, txn_id)
    if txn is None:
        return False
    if txn.plaid_transaction_id is not None:
        raise NotManualTransactionError(
            f"Transaction {txn_id} is a Plaid transaction and cannot be deleted"
        )
    session.delete(txn)
    session.commit()
    return True


def _serialize(txn: Transaction) -> dict:
    """Shape a Transaction into the API contract.

    Amount is emitted as signed integer cents. The Effective Category, its
    source, and is_spending are resolved on read from the stored Plaid signals
    and any manual override (ADR 0001). is_manual is True when plaid_transaction_id
    is None (the transaction was entered by hand, not synced from Plaid).
    """
    category = ResolvedCategory.resolve(txn.user_category, txn.pfc_signal)
    return {
        "id": str(txn.id),
        "account_id": str(txn.account_id),
        "date": txn.date.isoformat(),
        "name": txn.name,
        "merchant_name": txn.merchant_name,
        "amount": int(txn.amount * 100),
        "pending": txn.pending,
        "is_manual": txn.plaid_transaction_id is None,
        "category": {
            "major": category.major,
            "subcategory": category.subcategory,
        },
        "category_source": category.source,
        "is_spending": category.is_spending,
        "note": txn.note,
    }

import datetime

from sqlmodel import Session, col, select

from guru.api.categorization import ResolvedCategory
from guru.api.models import AccountType
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
    """Return CAD Credit Card transactions in [start, end], newest first.

    Filters to Credit Card accounts denominated in CAD, since the spending view
    covers only credit-card activity. Defaults to the last ~13 months.
    """
    default_start, default_end = _default_range()
    start = start or default_start
    end = end or default_end

    # Join to Account (via the FK) to filter to CAD Credit Card accounts. The
    # join condition is inferred from Transaction.account_id -> account.id.
    rows = session.exec(
        select(Transaction)
        .join(Account)
        .where(
            Account.type == AccountType.CREDIT,
            Account.iso_currency_code == "CAD",
            col(Transaction.date) >= start,
            col(Transaction.date) <= end,
        )
        .order_by(col(Transaction.date).desc())
    ).all()

    return [_serialize(txn) for txn in rows]


def _serialize(txn: Transaction) -> dict:
    """Shape a Transaction into the API contract.

    Amount is emitted as signed integer cents. The Effective Category, its
    source, and is_spending are resolved on read from the stored Plaid signals
    and any manual override (ADR 0001).
    """
    category = ResolvedCategory.resolve(txn.user_category, txn.pfc_signal)
    return {
        "id": str(txn.id),
        "account_id": str(txn.account_id),
        "date": txn.date.isoformat(),
        "merchant_name": txn.merchant_name,
        "amount": int(txn.amount * 100),
        "pending": txn.pending,
        "category": {
            "major": category.major,
            "subcategory": category.subcategory,
        },
        "category_source": category.source,
        "is_spending": category.is_spending,
    }

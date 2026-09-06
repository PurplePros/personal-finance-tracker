import re

from sqlmodel import Session, select

from guru.db.models import BudgetPlan

_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


class InvalidMonthError(ValueError):
    """Raised when a month string does not match YYYY-MM."""


def list_budget_plan(session: Session) -> list[dict]:
    """Return all budget plan entries."""
    rows = session.exec(select(BudgetPlan)).all()
    return [_serialize(r) for r in rows]


def upsert_budget_plan(
    session: Session,
    major: str,
    planned_cents: int,
    month: str | None = None,
) -> dict:
    """Upsert a budget plan entry. month=None means the global template.

    Raises InvalidMonthError if month is provided but not YYYY-MM.
    """
    if month is not None and not _MONTH_RE.match(month):
        raise InvalidMonthError(f"month must be YYYY-MM, got {month!r}")

    stmt = select(BudgetPlan).where(
        BudgetPlan.major == major,
        BudgetPlan.month == month,
    )
    existing = session.exec(stmt).first()

    if existing is not None:
        existing.planned_cents = planned_cents
        session.commit()
        session.refresh(existing)
        return _serialize(existing)

    row = BudgetPlan(major=major, month=month, planned_cents=planned_cents)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize(row)


def _serialize(row: BudgetPlan) -> dict:
    return {
        "major": row.major,
        "month": row.month,
        "planned_cents": row.planned_cents,
    }

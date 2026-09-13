from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.budget_service import (
    InvalidMonthError,
    list_budget_plan,
    upsert_budget_plan,
)

router = APIRouter(prefix="/api/budget")


class _PlanBody(BaseModel):
    planned_cents: int


@router.get("/plan")
def get_plan(session: Session = Depends(get_session)):
    """Return all budget plan entries (template and month overrides)."""
    return list_budget_plan(session)


@router.put("/plan/{major}")
def put_template(
    major: str,
    body: _PlanBody,
    session: Session = Depends(get_session),
):
    """Upsert the global template entry for a major category."""
    return upsert_budget_plan(session, major=major, planned_cents=body.planned_cents)


@router.put("/plan/{major}/{month}")
def put_override(
    major: str,
    month: str,
    body: _PlanBody,
    session: Session = Depends(get_session),
):
    """Upsert a month-specific planned amount for a major category."""
    try:
        return upsert_budget_plan(
            session, major=major, planned_cents=body.planned_cents, month=month
        )
    except InvalidMonthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

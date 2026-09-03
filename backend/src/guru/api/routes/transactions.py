import datetime

from fastapi import APIRouter, Depends
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.transaction_service import list_transactions

router = APIRouter(prefix="/api/transactions")


@router.get("")
def list(
    start: datetime.date | None = None,
    end: datetime.date | None = None,
    session: Session = Depends(get_session),
):
    """List CAD Credit Card transactions in the date range (default ~13 months)."""
    return list_transactions(session, start=start, end=end)

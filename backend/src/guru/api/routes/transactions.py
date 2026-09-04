import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.models import UserCategory
from guru.api.services.transaction_service import (
    InvalidCategoryError,
    list_transactions,
    patch_transaction_category,
)

router = APIRouter(prefix="/api/transactions")


class _CategoryIn(BaseModel):
    major: str
    subcategory: str


class _TransactionPatchBody(BaseModel):
    category: _CategoryIn | None


@router.get("")
def list(
    start: datetime.date | None = None,
    end: datetime.date | None = None,
    session: Session = Depends(get_session),
):
    """List CAD Credit Card transactions in the date range (default ~13 months)."""
    return list_transactions(session, start=start, end=end)


@router.patch("/{txn_id}")
def patch(
    txn_id: uuid.UUID,
    body: _TransactionPatchBody,
    session: Session = Depends(get_session),
):
    """Set or clear the category override on a transaction."""
    category = (
        UserCategory(major=body.category.major, subcategory=body.category.subcategory)
        if body.category is not None
        else None
    )
    try:
        result = patch_transaction_category(session, txn_id, category)
    except InvalidCategoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result

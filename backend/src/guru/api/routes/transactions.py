import datetime
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.models import UserCategory
from guru.api.services.transaction_service import (
    _UNSET,
    InvalidCategoryError,
    list_transactions,
    patch_transaction,
)

router = APIRouter(prefix="/api/transactions")


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
    body: dict = Body(...),
    session: Session = Depends(get_session),
):
    """Set or clear category/note on a transaction; omitted fields are unchanged."""
    category = _UNSET
    note = _UNSET

    if "category" in body:
        raw = body["category"]
        if raw is None:
            category = None
        else:
            has_major = isinstance(raw, dict) and "major" in raw
            has_sub = isinstance(raw, dict) and "subcategory" in raw
            if not has_major or not has_sub:
                raise HTTPException(status_code=422, detail="Invalid category payload")
            category = UserCategory(major=raw["major"], subcategory=raw["subcategory"])

    if "note" in body:
        note = body["note"]  # str | None

    try:
        result = patch_transaction(session, txn_id, category=category, note=note)
    except InvalidCategoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result

import datetime
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.models import UserCategory
from guru.api.services.manual_institution_service import get_manual_account_id
from guru.api.services.transaction_service import (
    InvalidCategoryError,
    NotManualTransactionError,
    _UNSET,
    create_manual_transaction,
    delete_manual_transaction,
    list_transactions,
    patch_transaction,
    update_manual_transaction,
)

router = APIRouter(prefix="/api/transactions")


@router.get("")
def list(
    start: datetime.date | None = None,
    end: datetime.date | None = None,
    session: Session = Depends(get_session),
):
    """List CAD spending transactions in the date range (default ~13 months)."""
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


@router.post("/manual", status_code=201)
def create_manual(
    body: dict = Body(...),
    session: Session = Depends(get_session),
):
    """Create a manual transaction on a Manual Institution's account."""
    institution_id_raw = body.get("institution_id")
    name = (body.get("name") or "").strip()
    amount_cents = body.get("amount_cents")
    date_raw = body.get("date")
    category_raw = body.get("category")

    if not institution_id_raw:
        raise HTTPException(status_code=422, detail="institution_id is required")
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if amount_cents is None:
        raise HTTPException(status_code=422, detail="amount_cents is required")
    if not date_raw:
        raise HTTPException(status_code=422, detail="date is required")
    if not isinstance(category_raw, dict) or "major" not in category_raw or "subcategory" not in category_raw:
        raise HTTPException(status_code=422, detail="category with major and subcategory is required")

    try:
        institution_id = uuid.UUID(str(institution_id_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="institution_id must be a UUID")

    try:
        date = datetime.date.fromisoformat(str(date_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    account_id = get_manual_account_id(session, institution_id)
    if account_id is None:
        raise HTTPException(status_code=404, detail="Manual institution not found")

    category = UserCategory(major=category_raw["major"], subcategory=category_raw["subcategory"])

    try:
        return create_manual_transaction(
            session,
            account_id=account_id,
            name=name,
            amount_cents=int(amount_cents),
            date=date,
            category=category,
            note=body.get("note") or None,
        )
    except NotManualTransactionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/manual/{txn_id}")
def update_manual(
    txn_id: uuid.UUID,
    body: dict = Body(...),
    session: Session = Depends(get_session),
):
    """Replace all fields on a manual transaction."""
    name = (body.get("name") or "").strip()
    amount_cents = body.get("amount_cents")
    date_raw = body.get("date")
    category_raw = body.get("category")

    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if amount_cents is None:
        raise HTTPException(status_code=422, detail="amount_cents is required")
    if not date_raw:
        raise HTTPException(status_code=422, detail="date is required")
    if not isinstance(category_raw, dict) or "major" not in category_raw or "subcategory" not in category_raw:
        raise HTTPException(status_code=422, detail="category with major and subcategory is required")

    try:
        date = datetime.date.fromisoformat(str(date_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    category = UserCategory(major=category_raw["major"], subcategory=category_raw["subcategory"])

    try:
        result = update_manual_transaction(
            session,
            txn_id=txn_id,
            name=name,
            amount_cents=int(amount_cents),
            date=date,
            category=category,
            note=body.get("note") or None,
        )
    except NotManualTransactionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result


@router.delete("/manual/{txn_id}", status_code=204)
def delete_manual(
    txn_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """Delete a manual transaction."""
    try:
        found = delete_manual_transaction(session, txn_id)
    except NotManualTransactionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not found:
        raise HTTPException(status_code=404, detail="Transaction not found")

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.account_service import list_accounts_by_institution
from guru.api.services.institution_service import get_institution, list_institutions
from guru.api.services.manual_institution_service import (
    HasTransactionsError,
    create_manual_institution,
    delete_manual_institution,
)

router = APIRouter(prefix="/api/institutions")


@router.get("")
def list(session: Session = Depends(get_session)):
    """List all institutions (excluding plaid_access_token)."""
    return list_institutions(session)


@router.get("/{id}")
def get(id: uuid.UUID, session: Session = Depends(get_session)):
    """Get a single institution by ID, or 404."""
    institution = get_institution(session, id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    return institution


@router.get("/{id}/accounts")
def list_accounts(id: uuid.UUID, session: Session = Depends(get_session)):
    """List all accounts for a given institution."""
    institution = get_institution(session, id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    return list_accounts_by_institution(session, id)


@router.post("/manual", status_code=201)
def create_manual(
    body: dict = Body(...),
    session: Session = Depends(get_session),
):
    """Create a Manual Institution and its paired Manual Account."""
    name = body.get("name", "").strip()
    holder = body.get("holder", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if not holder:
        raise HTTPException(status_code=422, detail="holder is required")
    return create_manual_institution(session, name=name, holder=holder)


@router.delete("/manual/{id}", status_code=204)
def delete_manual(id: uuid.UUID, session: Session = Depends(get_session)):
    """Delete a Manual Institution. Fails with 409 if it has transactions."""
    try:
        found = delete_manual_institution(session, id)
    except HasTransactionsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not found:
        raise HTTPException(status_code=404, detail="Manual institution not found")

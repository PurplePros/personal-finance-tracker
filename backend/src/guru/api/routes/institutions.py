import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.account_service import list_accounts_by_institution
from guru.api.services.institution_service import get_institution, list_institutions

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

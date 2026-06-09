import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.account_service import get_account, list_accounts

router = APIRouter(prefix="/api/accounts")


@router.get("")
def list(session: Session = Depends(get_session)):
    return list_accounts(session)


@router.get("/{id}")
def get(id: uuid.UUID, session: Session = Depends(get_session)):
    account = get_account(session, id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

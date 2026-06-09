from fastapi import APIRouter, Depends
from sqlmodel import Session

from guru.api.dependencies import get_plaid_service, get_session
from guru.api.plaid import PlaidService
from guru.api.services.sync_service import sync_all

router = APIRouter()


@router.post("/api/sync")
def sync(
    session: Session = Depends(get_session),
    plaid_service: PlaidService = Depends(get_plaid_service),
):
    """Sync accounts from Plaid for all linked institutions."""
    return sync_all(session, plaid_service)

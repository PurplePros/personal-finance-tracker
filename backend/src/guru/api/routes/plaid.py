import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from guru.api.dependencies import get_plaid_service, get_session
from guru.api.plaid import PlaidService
from guru.db.models import Institution
from guru.db.repository import InstitutionRepository

router = APIRouter(prefix="/api/plaid")


class LinkTokenRequest(BaseModel):
    item_id: str | None = None
    institution_id: str | None = None


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str


class ExchangeTokenResponse(BaseModel):
    institution_id: str


@router.post("/link-token", response_model=LinkTokenResponse)
def create_link_token(
    body: LinkTokenRequest = LinkTokenRequest(),
    session: Session = Depends(get_session),
    plaid_service: PlaidService = Depends(get_plaid_service),
) -> LinkTokenResponse:
    """Create a Plaid Link token.

    Omit item_id for a first-time connection; include it to open Link in update
    mode so the user can re-authenticate a broken token.
    """
    access_token: str | None = None
    if body.item_id is not None:
        institution = InstitutionRepository().get_by_item_id(session, body.item_id)
        if institution is None:
            raise HTTPException(status_code=404, detail="Institution not found")
        access_token = institution.plaid_access_token
    elif body.institution_id is not None:
        try:
            institution_uuid = uuid.UUID(body.institution_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid institution_id")
        institution = InstitutionRepository().get(session, institution_uuid)
        if institution is None:
            raise HTTPException(status_code=404, detail="Institution not found")
        access_token = institution.plaid_access_token

    link_token = plaid_service.create_link_token(access_token=access_token)
    return LinkTokenResponse(link_token=link_token)


@router.post("/exchange-token", response_model=ExchangeTokenResponse)
def exchange_token(
    body: ExchangeTokenRequest,
    session: Session = Depends(get_session),
    plaid_service: PlaidService = Depends(get_plaid_service),
) -> ExchangeTokenResponse:
    """Exchange a Plaid public_token for a permanent access token.

    Saves a new Institution row with the access_token and item_id.
    The caller should immediately POST /api/sync to populate accounts.
    """
    access_token, item_id = plaid_service.exchange_public_token(body.public_token)
    institution = Institution(
        name=body.institution_name,
        plaid_access_token=access_token,
        plaid_id="",
        plaid_item_id=item_id,
    )
    session.add(institution)
    session.commit()
    session.refresh(institution)
    return ExchangeTokenResponse(institution_id=str(institution.id))

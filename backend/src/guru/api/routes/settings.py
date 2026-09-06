from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from guru.api.dependencies import get_session
from guru.api.services.settings_service import (
    InvalidRatioError,
    get_settings,
    patch_settings,
)

router = APIRouter(prefix="/api/settings")


class _SettingsPatchBody(BaseModel):
    catherine_ratio: float


@router.get("")
def get(session: Session = Depends(get_session)):
    """Return current application settings."""
    return get_settings(session)


@router.patch("")
def patch(body: _SettingsPatchBody, session: Session = Depends(get_session)):
    """Update the Catherine/Jade split ratio. Must be strictly between 0 and 1."""
    try:
        return patch_settings(session, catherine_ratio=body.catherine_ratio)
    except InvalidRatioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

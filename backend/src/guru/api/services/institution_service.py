import uuid

from sqlmodel import Session

from guru.db.repository import InstitutionRepository


def list_institutions(session: Session) -> list[dict]:
    """Return all institutions as dicts, excluding plaid_access_token."""
    return [
        i.model_dump(exclude={"plaid_access_token"})
        for i in InstitutionRepository().list(session)
    ]


def get_institution(session: Session, id: uuid.UUID) -> dict | None:
    """Return a single institution as a dict (sans token), or None."""
    institution = InstitutionRepository().get(session, id)
    if institution is None:
        return None
    return institution.model_dump(exclude={"plaid_access_token"})

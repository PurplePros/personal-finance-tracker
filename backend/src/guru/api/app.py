import uuid
from collections.abc import Generator

import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Session, create_engine

from guru.api.settings import Settings
from guru.db.repository import AccountRepository, InstitutionRepository


def create_app(db_url: str) -> FastAPI:
    engine = create_engine(db_url)

    def get_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app = FastAPI(title="Guru API", version="0.1.0")

    account_repo = AccountRepository()
    institution_repo = InstitutionRepository()

    @app.get("/api/accounts")
    def list_accounts(session: Session = Depends(get_session)):
        return account_repo.list(session)

    @app.get("/api/accounts/{id}")
    def get_account(id: uuid.UUID, session: Session = Depends(get_session)):
        account = account_repo.get(session, id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        return account

    @app.get("/api/institutions")
    def list_institutions(session: Session = Depends(get_session)):
        return institution_repo.list(session)

    @app.get("/api/institutions/{id}")
    def get_institution(id: uuid.UUID, session: Session = Depends(get_session)):
        institution = institution_repo.get(session, id)
        if institution is None:
            raise HTTPException(status_code=404, detail="Institution not found")
        return institution

    return app


def main() -> None:
    settings = Settings()
    app = create_app(db_url=settings.database_url)
    uvicorn.run(app)


if __name__ == "__main__":
    main()

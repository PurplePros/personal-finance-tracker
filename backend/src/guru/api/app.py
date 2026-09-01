import uvicorn
from fastapi import FastAPI
from sqlmodel import create_engine

from guru.api.routes import accounts, institutions, sync
from guru.api.routes import plaid as plaid_routes
from guru.api.settings import Settings


def create_app(db_url: str) -> FastAPI:
    """Create and configure the FastAPI application with routes and engine."""
    app = FastAPI(title="Guru API", version="0.1.0")
    app.state.engine = create_engine(db_url)

    app.include_router(accounts.router)
    app.include_router(institutions.router)
    app.include_router(sync.router)
    app.include_router(plaid_routes.router)

    return app


def main() -> None:
    """Entry point: load settings, create app, and serve via uvicorn."""
    settings = Settings()
    app = create_app(db_url=settings.database_url)
    uvicorn.run(app)


if __name__ == "__main__":
    main()

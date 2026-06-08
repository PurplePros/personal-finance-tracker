from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings:
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data.db'}"
    debug_sql: bool = False


settings = Settings()

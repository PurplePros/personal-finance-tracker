from pathlib import Path

from pydantic import (
  Field,
)

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent

class Settings(BaseSettings, cli_parse_args=True):
  plaid_client_id: str = Field(description="Plaid Client ID")
  plaid_secret: str = Field(description="Plaid Secret")

  database_url: str = f"sqlite:///{BACKEND_DIR / 'data.db'}"

  model_config = SettingsConfigDict(env_file=".env")

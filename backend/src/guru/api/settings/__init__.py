from pydantic import (
  Field,
)

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings, cli_parse_args=True):
  plaid_client_id: str = Field(description="Plaid Client ID")
  plaid_secret: str = Field(description="Plaid Secret")

  model_config = SettingsConfigDict(env_file=".env")

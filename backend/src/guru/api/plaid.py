import logging

import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products

logger = logging.getLogger(__name__)


class PlaidService:
    """Handles calls to the Plaid API."""

    # Plaid removed the Development environment in their latest SDK; it merged
    # into Production. We keep "development" as a valid PLAID_ENV value and route
    # it to Production so existing credentials continue to work.
    _ENV_MAP = {
        "sandbox": plaid.Environment.Sandbox,
        "development": plaid.Environment.Production,
        "production": plaid.Environment.Production,
    }
    _CLIENT_NAME = "Guru"
    _USER_ID = "local-user"

    def __init__(self, client: plaid_api.PlaidApi) -> None:
        self._api_client = client

    @classmethod
    def default(
        cls, client_id: str, client_secret: str, plaid_env: str = "development"
    ) -> "PlaidService":
        """Create a PlaidService using credentials and the given environment."""
        host = cls._ENV_MAP.get(plaid_env, plaid.Environment.Production)
        configuration = plaid.Configuration(
            host=host,
            api_key={
                "clientId": client_id,
                "secret": client_secret,
            },
        )
        api_client = plaid.ApiClient(configuration)
        client = plaid_api.PlaidApi(api_client)
        return PlaidService(client=client)

    def list_accounts(self, access_token: str) -> list[dict]:
        """Fetch accounts for the given Plaid access token.

        Args:
            access_token: Plaid access token for the linked institution.

        Returns:
            A list of raw Plaid account dicts.

        Raises:
            plaid.ApiException: If the Plaid API request fails.
        """
        request = AccountsGetRequest(access_token=access_token)
        response = self._api_client.accounts_get(request)
        return response["accounts"]

    def create_link_token(self, access_token: str | None = None) -> str:
        """Create a Plaid Link token.

        Args:
            access_token: Pass to open Link in update mode (re-authentication
                for a broken token). Omit for a first-time connection.

        Returns:
            The link_token string used to initialise the Plaid Link widget.
        """
        user = LinkTokenCreateRequestUser(client_user_id=self._USER_ID)
        kwargs: dict = {
            "user": user,
            "client_name": self._CLIENT_NAME,
            "country_codes": [CountryCode("CA")],
            "language": "en",
        }
        if access_token is not None:
            kwargs["access_token"] = access_token
        else:
            kwargs["products"] = [Products("transactions")]
        request = LinkTokenCreateRequest(**kwargs)
        response = self._api_client.link_token_create(request)
        return response["link_token"]

    def exchange_public_token(self, public_token: str) -> tuple[str, str]:
        """Exchange a Link public_token for a permanent access_token and item_id.

        Args:
            public_token: Short-lived token returned by the Plaid Link widget
                on successful connection.

        Returns:
            A (access_token, item_id) tuple. Store both on the Institution row;
            access_token is used for API calls, item_id for update-mode Link.

        Raises:
            plaid.ApiException: If the exchange request fails.
        """
        request = ItemPublicTokenExchangeRequest(public_token=public_token)
        response = self._api_client.item_public_token_exchange(request)
        return response["access_token"], response["item_id"]

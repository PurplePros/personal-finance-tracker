import logging

import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest

logger = logging.getLogger(__name__)


class PlaidService:
    """Handles calls to the Plaid API."""

    def __init__(self, client: plaid_api.PlaidApi) -> None:
        """Initialize with a configured Plaid API client.

        Args:
            client: A configured PlaidApi client instance for making API calls.
        """
        self._api_client = client

    @classmethod
    def default(cls, client_id: str, client_secret: str) -> PlaidService:
        """Create a PlaidService using production environment credentials.

        Args:
            client_id: Plaid API client ID.
            client_secret: Plaid API secret.

        Returns:
            A fully configured PlaidService instance.
        """
        configuration = plaid.Configuration(
            host=plaid.Environment.Production,
            api_key={
                "clientId": client_id,
                "secret": client_secret,
            },
        )
        api_client = plaid.ApiClient(configuration)
        client = plaid_api.PlaidApi(api_client)
        return PlaidService(client=client)

    def list_accounts(self, access_token: str) -> list[dict]:
        """Fetch accounts for the given access token.

        Args:
            access_token: Plaid access token for the linked institution.

        Returns:
            A list of raw Plaid account dicts.

        Raises:
            plaid.ApiException: If the Plaid API request fails.
        """
        request = AccountsGetRequest(
            access_token=access_token,
        )
        response = self._api_client.accounts_get(request)
        return response["accounts"]

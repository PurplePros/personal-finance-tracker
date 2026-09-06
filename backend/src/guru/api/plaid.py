import logging
from typing import NamedTuple

import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_update import LinkTokenCreateRequestUpdate
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.link_token_transactions import LinkTokenTransactions
from plaid.model.products import Products
from plaid.model.transactions_sync_request import TransactionsSyncRequest

# Days of transaction history to request at link time. Plaid backfills up to this
# window on the first Sync; the Spending view shows ~13 months, so request ~13.
_BACKFILL_DAYS = 397

logger = logging.getLogger(__name__)


class TransactionsSyncResult(NamedTuple):
    """Aggregated result of a full cursor-based transactions sync.

    `added` and `modified` are raw Plaid transaction dicts; `removed` is the
    list of Plaid transaction ids that no longer exist. `next_cursor` is
    persisted on the Institution so the next sync fetches only deltas.
    """

    added: list[dict]
    modified: list[dict]
    removed: list[str]
    next_cursor: str


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

    def fetch_transactions(
        self, access_token: str, cursor: str | None = None
    ) -> TransactionsSyncResult:
        """Fetch transaction deltas via Plaid's cursor-based sync.

        Pages through `transactions/sync` until `has_more` is false, aggregating
        every batch into one result. A null cursor performs the initial backfill
        (Plaid returns ~24 months); a non-null cursor returns only changes since.

        Args:
            access_token: Plaid access token for the linked institution.
            cursor: Cursor from the previous sync, or None for the first sync.

        Returns:
            A TransactionsSyncResult with the aggregated added / modified /
            removed batches and the cursor to persist for the next sync.

        Raises:
            plaid.ApiException: If the Plaid API request fails.
        """
        added: list[dict] = []
        modified: list[dict] = []
        removed: list[str] = []
        next_cursor = cursor or ""

        has_more = True
        while has_more:
            kwargs: dict = {"access_token": access_token}
            if next_cursor:
                kwargs["cursor"] = next_cursor
            response = self._api_client.transactions_sync(
                TransactionsSyncRequest(**kwargs)
            )
            added.extend(response["added"])
            modified.extend(response["modified"])
            removed.extend(r["transaction_id"] for r in response["removed"])
            next_cursor = response["next_cursor"]
            has_more = response["has_more"]

        return TransactionsSyncResult(
            added=added,
            modified=modified,
            removed=removed,
            next_cursor=next_cursor,
        )

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
            # Bound the first-Sync backfill to the Spending view's window.
            "transactions": LinkTokenTransactions(days_requested=_BACKFILL_DAYS),
        }
        if access_token is not None:
            kwargs["access_token"] = access_token
            # Allow the user to add new accounts to the existing item, not just re-auth.
            kwargs["update"] = LinkTokenCreateRequestUpdate(
                account_selection_enabled=True
            )
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

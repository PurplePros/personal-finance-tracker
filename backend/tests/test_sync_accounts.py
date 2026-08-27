"""HTTP-seam tests for balance, currency, and investment-type ingestion.

Each test syncs against a faked Plaid, then reads the accounts back through
`GET /api/accounts` — verifiable through the API alone.
"""

from decimal import Decimal

from helpers import plaid_account


def test_sync_persists_balance_and_currency(client, fake_plaid, seed_institution):
    """A synced account carries its Plaid balance and ISO currency."""
    institution = seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="acc-1",
                name="Tangerine Savings Account",
                plaid_type="depository",
                subtype="savings",
                current=1234.56,
                iso_currency_code="CAD",
            )
        ],
    )

    assert client.post("/api/sync").status_code == 200

    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    account = accounts[0]
    assert account["institution_id"] == str(institution.id)
    assert Decimal(str(account["balance"])) == Decimal("1234.56")
    assert account["iso_currency_code"] == "CAD"
    assert account["type"] == "Savings"


def test_registered_account_syncs_as_investment(client, fake_plaid, seed_institution):
    """A registered/investment Plaid account maps to Investment, not Chequing."""
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="acc-rrsp",
                name="RRSP",
                plaid_type="investment",
                subtype="rrsp",
                current=50000.00,
            ),
            plaid_account(
                account_id="acc-tfsa",
                name="TFSA",
                plaid_type="investment",
                subtype="tfsa",
                current=25000.00,
            ),
        ],
    )

    assert client.post("/api/sync").status_code == 200

    accounts = client.get("/api/accounts").json()
    by_name = {a["name"]: a for a in accounts}
    assert by_name["RRSP"]["type"] == "Investment"
    assert by_name["TFSA"]["type"] == "Investment"


def test_sync_is_idempotent_create_then_update(client, fake_plaid, seed_institution):
    """Re-syncing the same Plaid account updates it in place, not duplicates."""
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="acc-1",
                name="Chequing",
                plaid_type="depository",
                subtype="checking",
                current=100.00,
            )
        ],
    )
    assert client.post("/api/sync").status_code == 200

    first = client.get("/api/accounts").json()
    assert len(first) == 1
    original_id = first[0]["id"]
    assert Decimal(str(first[0]["balance"])) == Decimal("100.00")

    # Same Plaid account id, new name and balance -> update in place.
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="acc-1",
                name="Everyday Chequing",
                plaid_type="depository",
                subtype="checking",
                current=250.75,
            )
        ],
    )
    assert client.post("/api/sync").status_code == 200

    second = client.get("/api/accounts").json()
    assert len(second) == 1
    assert second[0]["id"] == original_id
    assert second[0]["name"] == "Everyday Chequing"
    assert Decimal(str(second[0]["balance"])) == Decimal("250.75")


def test_accounts_endpoint_exposes_dashboard_fields(
    client, fake_plaid, seed_institution
):
    """GET /api/accounts returns balance, currency, and type for each account."""
    seed_institution(access_token="tok-1")
    fake_plaid.set_accounts(
        "tok-1",
        [
            plaid_account(
                account_id="acc-1",
                name="Visa",
                plaid_type="credit",
                subtype="credit card",
                current=-450.00,
            )
        ],
    )
    client.post("/api/sync")

    account = client.get("/api/accounts").json()[0]
    assert set(account) >= {"balance", "iso_currency_code", "type"}
    assert Decimal(str(account["balance"])) == Decimal("-450.00")
    assert account["iso_currency_code"] == "CAD"
    assert account["type"] == "Credit Card"

"""Builders for faked Plaid `accounts_get` payloads used in tests."""


def plaid_account(
    account_id: str,
    name: str,
    plaid_type: str,
    subtype: str | None,
    current: float,
    iso_currency_code: str | None = "CAD",
) -> dict:
    """Build a fake Plaid `accounts_get` account dict."""
    return {
        "account_id": account_id,
        "name": name,
        "type": plaid_type,
        "subtype": subtype,
        "balances": {
            "current": current,
            "available": current,
            "iso_currency_code": iso_currency_code,
            "unofficial_currency_code": None,
        },
    }

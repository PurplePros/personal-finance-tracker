"""Builders for faked Plaid payloads used in tests."""

import datetime


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


def plaid_transaction(
    transaction_id: str,
    account_id: str,
    amount: float,
    date: datetime.date | None = None,
    name: str = "Test Merchant",
    merchant_name: str | None = None,
    pending: bool = False,
    pending_transaction_id: str | None = None,
    primary_category: str | None = None,
    detailed_category: str | None = None,
    confidence: str | None = None,
) -> dict:
    """Build a fake Plaid transaction dict from a sync response."""
    if date is None:
        date = datetime.date.today()

    return {
        "transaction_id": transaction_id,
        "account_id": account_id,
        "amount": amount,
        "date": date.isoformat(),
        "name": name,
        "merchant_name": merchant_name,
        "pending": pending,
        "pending_transaction_id": pending_transaction_id,
        "personal_finance_category": {
            "primary": primary_category,
            "detailed": detailed_category,
            "confidence_level": confidence,
        },
    }

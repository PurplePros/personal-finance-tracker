import json
from decimal import Decimal

import plaid
from sqlmodel import Session, select

from guru.api.models import AccountType
from guru.api.plaid import PlaidService
from guru.db.models import Account
from guru.db.repository import InstitutionRepository

PLAID_TYPE_MAP: dict[tuple[str, str], AccountType] = {
    ("depository", "checking"): AccountType.CHEQUING,
    ("depository", "savings"): AccountType.SAVINGS,
    ("credit", "credit card"): AccountType.CREDIT,
}

# Plaid top-level `type`s that are investment/registered accounts (RRSP, TFSA,
# brokerage, ...). These map to Investment regardless of subtype; the specific
# registered product stays in Account.name.
INVESTMENT_PLAID_TYPES: frozenset[str] = frozenset({"investment", "brokerage"})


def _map_account_type(plaid_type: str, plaid_subtype: str) -> AccountType:
    """Map Plaid type/subtype to our AccountType enum; default to Chequing."""
    if plaid_type in INVESTMENT_PLAID_TYPES:
        return AccountType.INVESTMENT
    return PLAID_TYPE_MAP.get(
        (plaid_type, plaid_subtype),
        AccountType.CHEQUING,
    )


def _read_balance(pa: dict, account_type: AccountType) -> Decimal:
    """Read the current balance as an exact Decimal, avoiding float drift.

    Plaid reports credit card balances as positive when money is owed, which
    is the opposite of our sign convention (negative = liability). Negate them.
    """
    balance = Decimal(str(pa["balances"]["current"]))
    if account_type == AccountType.CREDIT:
        return -balance
    return balance


def _extract_plaid_error_code(exc: Exception) -> str:
    """Pull error_code out of a Plaid ApiException body, or return '' on failure."""
    if not isinstance(exc, plaid.ApiException):
        return ""
    try:
        body = exc.body
        parsed = json.loads(body) if isinstance(body, str) else body
        return str(parsed.get("error_code", ""))
    except Exception:
        return ""


def sync_all(session: Session, plaid_service: PlaidService) -> list[dict]:
    """Fetch accounts from Plaid for every institution and upsert them."""
    institutions = InstitutionRepository().list(session)
    results = []
    for institution in institutions:
        try:
            plaid_accounts = plaid_service.list_accounts(institution.plaid_access_token)
        except Exception as e:
            error_code = _extract_plaid_error_code(e)
            results.append(
                {
                    "institution": str(institution.name),
                    "institution_id": str(institution.id),
                    "status": "error",
                    "error": str(e),
                    "error_code": error_code,
                }
            )
            continue

        synced = []
        for pa in plaid_accounts:
            account_type = _map_account_type(
                str(pa["type"]), str(pa.get("subtype", ""))
            )
            balance = _read_balance(pa, account_type)
            iso_currency_code = str(pa["balances"]["iso_currency_code"])
            existing = session.exec(
                select(Account).where(
                    Account.plaid_id == pa["account_id"],
                    Account.institution_id == institution.id,
                )
            ).first()

            if existing:
                existing.name = pa["name"]
                existing.type = account_type
                existing.balance = balance
                existing.iso_currency_code = iso_currency_code
                synced.append(
                    {
                        "plaid_id": pa["account_id"],
                        "action": "updated",
                    }
                )
            else:
                session.add(
                    Account(
                        name=pa["name"],
                        institution_id=institution.id,
                        plaid_id=pa["account_id"],
                        type=account_type,
                        balance=balance,
                        iso_currency_code=iso_currency_code,
                    )
                )
                synced.append(
                    {
                        "plaid_id": pa["account_id"],
                        "action": "created",
                    }
                )

        session.commit()
        results.append(
            {
                "institution": str(institution.name),
                "status": "ok",
                "accounts": synced,
            }
        )

    return results

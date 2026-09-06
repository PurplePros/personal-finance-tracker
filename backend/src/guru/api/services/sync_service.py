import datetime
import json
import logging
import uuid
from decimal import Decimal

import plaid
from sqlmodel import Session, select

from guru.api.models import AccountType, PlaidConfidence, SPENDING_ACCOUNT_TYPES
from guru.api.plaid import PlaidService
from guru.db.models import Account, Institution, Transaction
from guru.db.repository import InstitutionRepository

logger = logging.getLogger(__name__)

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
        if not isinstance(parsed, dict):
            return ""
        return str(parsed.get("error_code", ""))
    except Exception:
        return ""


def _parse_confidence(raw: str | None) -> PlaidConfidence | None:
    """Coerce Plaid's confidence_level string into the enum, tolerating unknowns."""
    if raw is None:
        return None
    try:
        return PlaidConfidence(raw)
    except ValueError:
        return PlaidConfidence.UNKNOWN


def _plaid_transaction_fields(pt: dict, account_id: uuid.UUID) -> dict:
    """Map a raw Plaid transaction dict to Transaction column values.

    Excludes plaid_transaction_id, which is the immutable upsert key set once at
    insert. The result seeds a new row and updates an existing one, so the
    mapping is written exactly once for both paths.
    """
    pfc = pt.get("personal_finance_category") or {}
    return {
        "account_id": account_id,
        "pending_transaction_id": pt.get("pending_transaction_id"),
        "plaid_primary_category": pfc.get("primary"),
        "plaid_detailed_category": pfc.get("detailed"),
        "plaid_confidence": _parse_confidence(pfc.get("confidence_level")),
        "merchant_name": pt.get("merchant_name"),
        "name": pt["name"],
        "amount": Decimal(str(pt["amount"])),
        "date": pt["date"]
        if isinstance(pt["date"], datetime.date)
        else datetime.date.fromisoformat(pt["date"]),
        "pending": bool(pt["pending"]),
    }


def _sync_transactions(
    session: Session, institution: Institution, plaid_service: PlaidService
) -> int:
    """Fetch and persist transaction deltas for one institution.

    Upserts added/modified rows keyed by Plaid transaction id, deletes removed
    rows, and persists the next cursor. Only transactions on this institution's
    Credit Card accounts are stored; others are ignored. Returns the number of
    added/modified transactions applied.
    """
    result = plaid_service.fetch_transactions(
        institution.plaid_access_token, institution.transactions_cursor
    )

    # Map Plaid account ids to our Credit Card and Chequing account ids for this
    # institution. Savings and Investment accounts are excluded from transaction sync.
    spending_accounts = session.exec(
        select(Account).where(
            Account.institution_id == institution.id,
            Account.type.in_(list(SPENDING_ACCOUNT_TYPES)),
        )
    ).all()
    account_by_plaid_id = {a.plaid_id: a.id for a in spending_accounts}

    applied = 0
    for pt in [*result.added, *result.modified]:
        account_id = account_by_plaid_id.get(pt["account_id"])
        if account_id is None:
            logger.debug(
                "Skipping transaction %s: Plaid account %s not a spending account for institution %s",
                pt["transaction_id"],
                pt["account_id"],
                institution.id,
            )
            continue
        fields = _plaid_transaction_fields(pt, account_id)
        existing = session.exec(
            select(Transaction).where(
                Transaction.plaid_transaction_id == pt["transaction_id"]
            )
        ).first()
        if existing is None:
            session.add(
                Transaction(plaid_transaction_id=pt["transaction_id"], **fields)
            )
        else:
            for name, value in fields.items():
                setattr(existing, name, value)
        applied += 1

    for removed_id in result.removed:
        row = session.exec(
            select(Transaction).where(Transaction.plaid_transaction_id == removed_id)
        ).first()
        if row is not None:
            session.delete(row)

    institution.transactions_cursor = result.next_cursor
    session.add(institution)
    session.commit()
    return applied


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

        result = {
            "institution": str(institution.name),
            "status": "ok",
            "accounts": synced,
        }
        try:
            result["transactions"] = _sync_transactions(
                session, institution, plaid_service
            )
        except Exception as e:
            # Accounts already synced; a transaction-fetch failure is isolated to
            # this institution so the rest of the Sync still completes.
            session.rollback()
            result["transactions_error"] = str(e)
            result["transactions_error_code"] = _extract_plaid_error_code(e)
        results.append(result)

    return results

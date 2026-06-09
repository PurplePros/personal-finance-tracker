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


def _map_account_type(plaid_type: str, plaid_subtype: str) -> AccountType:
    return PLAID_TYPE_MAP.get(
        (plaid_type, plaid_subtype),
        AccountType.CHEQUING,
    )


def sync_all(session: Session, plaid_service: PlaidService) -> list[dict]:
    institutions = InstitutionRepository().list(session)
    results = []
    for institution in institutions:
        try:
            plaid_accounts = plaid_service.list_accounts(institution.plaid_access_token)
        except Exception as e:
            results.append(
                {
                    "institution": str(institution.name),
                    "status": "error",
                    "error": str(e),
                }
            )
            continue

        synced = []
        for pa in plaid_accounts:
            account_type = _map_account_type(
                str(pa["type"]), str(pa.get("subtype", ""))
            )
            existing = session.exec(
                select(Account).where(
                    Account.plaid_id == pa["account_id"],
                    Account.institution_id == institution.id,
                )
            ).first()

            if existing:
                existing.name = pa["name"]
                existing.type = account_type
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

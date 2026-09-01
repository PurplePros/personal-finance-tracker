from enum import StrEnum


class AccountType(StrEnum):
    """Coarse classification of an Account.

    Registered accounts (RRSP, TFSA) are ``Investment``; the specific product
    name is carried by ``Account.name``, not by the type.
    """

    SAVINGS = "Savings"
    CHEQUING = "Chequing"
    CREDIT = "Credit Card"
    INVESTMENT = "Investment"

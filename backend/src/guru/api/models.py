from enum import StrEnum


class Institution(StrEnum):
    """Financial institution supported for linking accounts."""

    WEALTHSIMPLE = "Wealthsimple"
    TANGERINE = "Tangerine"


class AccountType(StrEnum):
    """Coarse classification of an Account.

    Registered accounts (RRSP, TFSA) are ``Investment``; the specific product
    name is carried by ``Account.name``, not by the type.
    """

    SAVINGS = "Savings"
    CHEQUING = "Chequing"
    CREDIT = "Credit Card"
    INVESTMENT = "Investment"

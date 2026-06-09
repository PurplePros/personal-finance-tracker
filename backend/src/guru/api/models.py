from enum import StrEnum


class Institution(StrEnum):
    """Financial institution supported for linking accounts."""
    WEALTHSIMPLE = "Wealthsimple"
    TANGERINE = "Tangerine"

class AccountType(StrEnum):
    """Types of financial accounts tracked in the system."""
    SAVINGS = "Savings"
    CHEQUING = "Chequing"
    CREDIT = "Credit Card"
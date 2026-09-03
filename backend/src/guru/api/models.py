from enum import StrEnum
from typing import NamedTuple


class AccountType(StrEnum):
    """Coarse classification of an Account.

    Registered accounts (RRSP, TFSA) are ``Investment``; the specific product
    name is carried by ``Account.name``, not by the type.
    """

    SAVINGS = "Savings"
    CHEQUING = "Chequing"
    CREDIT = "Credit Card"
    INVESTMENT = "Investment"


class PlaidConfidence(StrEnum):
    """Confidence level Plaid assigns to a Personal Finance Category signal."""

    VERY_HIGH = "VERY_HIGH"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class CategorySource(StrEnum):
    """Where a Transaction's Effective Category came from.

    ``plaid_low_confidence`` is still a Plaid-derived Category, flagged for the
    holder to review because Plaid's confidence was below MEDIUM.
    """

    USER = "user"
    PLAID = "plaid"
    PLAID_LOW_CONFIDENCE = "plaid_low_confidence"


class PlaidPFCSignal(NamedTuple):
    """The three Plaid Personal Finance Category fields that travel together."""

    primary: str | None
    detailed: str | None
    confidence: PlaidConfidence | None


class UserCategory(NamedTuple):
    """A holder's manual category assignment (major + subcategory pair)."""

    major: str
    subcategory: str

"""Read-time categorization engine (ADR 0001).

The taxonomy is the single source of truth for Categories. A static map turns
Plaid's Personal Finance Category (PFC) signals into taxonomy entries; the
resolver applies the holder's manual override first and otherwise the PFC map,
always. Nothing here is persisted - Effective Category is recomputed on read.
"""

from typing import NamedTuple

from guru.api.models import (
    CategorySource,
    PlaidConfidence,
    PlaidPFCSignal,
    UserCategory,
)

OTHER = "Other"

# The fixed taxonomy: each major Category maps to its ordered Subcategories.
# Every major except the terminal Miscellaneous ends with Other, the landing
# spot for transactions that belong to the major but no specific Subcategory.
TAXONOMY: dict[str, list[str]] = {
    "Food and personal items": ["Restaurants", "Groceries and personal items", OTHER],
    "Shopping": ["Clothing", "Gifts", "Home and auto", OTHER],
    "Transportation": [
        "Auto insurance",
        "Gas, parking, and tolls",
        "Public transit, taxis, and rideshares",
        OTHER,
    ],
    "Bills": ["Subscriptions", "Internet and phone", "Utilities", OTHER],
    "Health and wellness": ["Fitness and sports", "Medical", OTHER],
    "Housing": ["Mortgage", "Home insurance", "Property taxes", OTHER],
    "Travel": ["Flights", "Hotels", OTHER],
    "Fun money": ["Activities", OTHER],
    "Finances": ["Bank fees and interest", "Cash withdrawals", "Transfers", OTHER],
    "Miscellaneous": [],
}

# The Finances Subcategory that moves money rather than spending it. It is the
# only Category that is never counted as spending.
_TRANSFERS = ("Finances", "Transfers")

# Plaid confidence at or above MEDIUM is trusted; below it the assignment is
# still applied but flagged low-confidence for review.
_CONFIDENT = frozenset(
    {PlaidConfidence.VERY_HIGH, PlaidConfidence.HIGH, PlaidConfidence.MEDIUM}
)

# Landing Category for a Plaid PFC primary when the detailed signal is absent or
# unmapped. Per spec, a primary-only signal lands in its major's Other. The
# transfer family is the deliberate exception: it lands in Transfers rather than
# Other so that a card payment or account transfer identified only at the primary
# level is still non-spending (is_spending keys off the Transfers Category).
_PRIMARY_TO_CATEGORY: dict[str, tuple[str, str | None]] = {
    "FOOD_AND_DRINK": ("Food and personal items", OTHER),
    "GENERAL_MERCHANDISE": ("Shopping", OTHER),
    "HOME_IMPROVEMENT": ("Shopping", OTHER),
    "TRANSPORTATION": ("Transportation", OTHER),
    "TRAVEL": ("Travel", OTHER),
    "RENT_AND_UTILITIES": ("Bills", OTHER),
    "MEDICAL": ("Health and wellness", OTHER),
    "PERSONAL_CARE": ("Health and wellness", OTHER),
    "ENTERTAINMENT": ("Fun money", OTHER),
    "BANK_FEES": ("Finances", OTHER),
    "TRANSFER_IN": _TRANSFERS,
    "TRANSFER_OUT": _TRANSFERS,
    "LOAN_PAYMENTS": _TRANSFERS,
    "INCOME": ("Finances", OTHER),
    "GENERAL_SERVICES": ("Miscellaneous", None),
    "GOVERNMENT_AND_NON_PROFIT": ("Miscellaneous", None),
}

# Specific Plaid PFC detailed signals mapped to a precise Subcategory. Absent
# keys fall back to the primary map above. This map grows as real transaction
# data reveals which detailed signals matter (ADR 0001).
_DETAILED_TO_CATEGORY: dict[str, tuple[str, str]] = {
    "FOOD_AND_DRINK_GROCERIES": (
        "Food and personal items",
        "Groceries and personal items",
    ),
    "FOOD_AND_DRINK_RESTAURANT": ("Food and personal items", "Restaurants"),
    "FOOD_AND_DRINK_FAST_FOOD": ("Food and personal items", "Restaurants"),
    "FOOD_AND_DRINK_COFFEE": ("Food and personal items", "Restaurants"),
    "FOOD_AND_DRINK_ALCOHOL_AND_BARS": ("Food and personal items", "Restaurants"),
    "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES": ("Shopping", "Clothing"),
    "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES": ("Shopping", "Gifts"),
    "TRANSPORTATION_GAS": ("Transportation", "Gas, parking, and tolls"),
    "TRANSPORTATION_PARKING": ("Transportation", "Gas, parking, and tolls"),
    "TRANSPORTATION_TOLLS": ("Transportation", "Gas, parking, and tolls"),
    "TRANSPORTATION_PUBLIC_TRANSIT": (
        "Transportation",
        "Public transit, taxis, and rideshares",
    ),
    "TRANSPORTATION_TAXIS_AND_RIDE_SHARES": (
        "Transportation",
        "Public transit, taxis, and rideshares",
    ),
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE": ("Bills", "Internet and phone"),
    "RENT_AND_UTILITIES_TELEPHONE": ("Bills", "Internet and phone"),
    "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY": ("Bills", "Utilities"),
    "RENT_AND_UTILITIES_WATER": ("Bills", "Utilities"),
    "RENT_AND_UTILITIES_SEWAGE_AND_WASTE": ("Bills", "Utilities"),
    "RENT_AND_UTILITIES_RENT": ("Housing", OTHER),
    "TRAVEL_FLIGHTS": ("Travel", "Flights"),
    "TRAVEL_LODGING": ("Travel", "Hotels"),
    "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": _TRANSFERS,
    "TRANSFER_OUT_ACCOUNT_TRANSFER": _TRANSFERS,
    "TRANSFER_IN_ACCOUNT_TRANSFER": _TRANSFERS,
    "TRANSFER_OUT_WITHDRAWAL": ("Finances", "Cash withdrawals"),
    "BANK_FEES_ATM_FEES": ("Finances", "Bank fees and interest"),
    "BANK_FEES_FOREIGN_TRANSACTION_FEES": ("Finances", "Bank fees and interest"),
    "BANK_FEES_INSUFFICIENT_FUNDS": ("Finances", "Bank fees and interest"),
    "BANK_FEES_INTEREST_CHARGE": ("Finances", "Bank fees and interest"),
    "BANK_FEES_OVERDRAFT_FEES": ("Finances", "Bank fees and interest"),
    "BANK_FEES_OTHER_BANK_FEES": ("Finances", "Bank fees and interest"),
    "MEDICAL_PRIMARY_CARE": ("Health and wellness", "Medical"),
    "MEDICAL_DENTAL_CARE": ("Health and wellness", "Medical"),
    "MEDICAL_EYE_CARE": ("Health and wellness", "Medical"),
    "MEDICAL_PHARMACIES_AND_SUPPLEMENTS": ("Health and wellness", "Medical"),
    "MEDICAL_VETERINARY_SERVICES": ("Health and wellness", "Medical"),
    "MEDICAL_NURSING_CARE": ("Health and wellness", "Medical"),
    "MEDICAL_OTHER_MEDICAL": ("Health and wellness", "Medical"),
}


def validate_user_category(major: str, subcategory: str) -> bool:
    """Return True if (major, subcategory) is a valid taxonomy pair, False otherwise."""
    subcategories = TAXONOMY.get(major)
    return subcategories is not None and subcategory in subcategories


def _map_pfc(signal: PlaidPFCSignal) -> tuple[str, str | None]:
    """Resolve a Plaid PFC signal to a taxonomy (major, subcategory).

    Prefers the detailed signal; falls back to the primary's landing Category;
    lands unmapped signals in Miscellaneous.
    """
    if signal.detailed and signal.detailed in _DETAILED_TO_CATEGORY:
        return _DETAILED_TO_CATEGORY[signal.detailed]
    if signal.primary and signal.primary in _PRIMARY_TO_CATEGORY:
        return _PRIMARY_TO_CATEGORY[signal.primary]
    return "Miscellaneous", None


class ResolvedCategory(NamedTuple):
    """A Transaction's Effective Category plus where it came from.

    ``subcategory`` is None only for Miscellaneous, the terminal major with no
    Subcategories.
    """

    major: str
    subcategory: str | None
    source: CategorySource

    @classmethod
    def resolve(
        cls,
        user_category: UserCategory | None,
        pfc_signal: PlaidPFCSignal,
    ) -> "ResolvedCategory":
        """Resolve the Effective Category by first opinion.

        The holder's manual override wins outright. Otherwise the PFC map is
        applied regardless of confidence; below MEDIUM only flags the source as
        low-confidence, it does not change the Category.
        """
        if user_category is not None:
            return cls(
                major=user_category.major,
                subcategory=user_category.subcategory,
                source=CategorySource.USER,
            )

        major, subcategory = _map_pfc(pfc_signal)
        source = (
            CategorySource.PLAID
            if pfc_signal.confidence in _CONFIDENT
            else CategorySource.PLAID_LOW_CONFIDENCE
        )
        return cls(major=major, subcategory=subcategory, source=source)

    @property
    def is_spending(self) -> bool:
        """Whether this Category counts toward Spending.

        Only Transfers (card payments and money moved between accounts) are
        excluded. Everything else counts, including bank fees and cash
        withdrawals.
        """
        return (self.major, self.subcategory) != _TRANSFERS

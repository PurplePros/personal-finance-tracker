from fastapi import APIRouter

from guru.api.categorization import TAXONOMY

router = APIRouter(prefix="/api/categories")


@router.get("")
def list():
    """Return the canonical taxonomy: every major with its ordered Subcategories."""
    return [
        {"major": major, "subcategories": subcategories}
        for major, subcategories in TAXONOMY.items()
    ]

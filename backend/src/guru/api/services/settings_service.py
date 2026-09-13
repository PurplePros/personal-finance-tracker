from sqlmodel import Session

from guru.db.models import AppSettings

_CATHERINE_RATIO_KEY = "catherine_ratio"
_DEFAULT_RATIO = 0.5


class InvalidRatioError(ValueError):
    """Raised when catherine_ratio is not strictly between 0 and 1."""


def get_settings(session: Session) -> dict:
    """Return current app settings with defaults for any missing keys."""
    row = session.get(AppSettings, _CATHERINE_RATIO_KEY)
    ratio = float(row.value) if row is not None else _DEFAULT_RATIO
    return {"catherine_ratio": ratio}


def patch_settings(session: Session, catherine_ratio: float) -> dict:
    """Update catherine_ratio. Must be strictly between 0 and 1.

    Raises InvalidRatioError otherwise.
    """
    if not (0 < catherine_ratio < 1):
        raise InvalidRatioError(
            f"catherine_ratio must be strictly between 0 and 1, got {catherine_ratio}"
        )

    row = session.get(AppSettings, _CATHERINE_RATIO_KEY)
    if row is not None:
        row.value = str(catherine_ratio)
    else:
        row = AppSettings(key=_CATHERINE_RATIO_KEY, value=str(catherine_ratio))
        session.add(row)

    session.commit()
    return {"catherine_ratio": catherine_ratio}

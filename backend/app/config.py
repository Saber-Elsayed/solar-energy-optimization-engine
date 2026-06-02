import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"
_ENV_EXAMPLE_FILE = _BACKEND_ROOT / ".env.example"


def load_environment() -> None:
    """Load backend/.env; fall back to .env.example for local development."""
    if _ENV_FILE.is_file():
        load_dotenv(_ENV_FILE)
        return
    if _ENV_EXAMPLE_FILE.is_file():
        load_dotenv(_ENV_EXAMPLE_FILE)


@lru_cache
def get_admin_emails() -> frozenset[str]:
    load_environment()
    return frozenset(
        email.strip().lower()
        for email in os.getenv("FIREBASE_ADMIN_EMAILS", "").split(",")
        if email.strip()
    )

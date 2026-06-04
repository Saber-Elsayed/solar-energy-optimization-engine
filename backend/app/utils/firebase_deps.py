import logging
from typing import Any

from fastapi import Depends, Header, HTTPException

from ..config import get_admin_emails
from ..services.firebase_admin_service import verify_firebase_id_token

logger = logging.getLogger(__name__)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return token


def get_optional_firebase_user(authorization: str | None = Header(default=None)) -> dict[str, Any] | None:
    """Decode Bearer token when present; never fail the request if auth is missing or invalid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        return verify_firebase_id_token(token)
    except HTTPException:
        return None
    except RuntimeError as exc:
        logger.warning("Firebase Admin unavailable for optional auth: %s", exc)
        return None
    except Exception as exc:
        logger.warning("Optional Firebase token verification failed: %s", exc)
        return None


def get_firebase_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _extract_bearer_token(authorization)
    try:
        return verify_firebase_id_token(token)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Firebase token") from exc


def get_firebase_admin_user(
    firebase_user: dict[str, Any] = Depends(get_firebase_user),
) -> dict[str, Any]:
    role = firebase_user.get("role")
    email = (firebase_user.get("email") or "").lower()
    admin_emails = get_admin_emails()
    is_admin = role == "admin" or email in admin_emails
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if email in admin_emails and role != "admin":
        try:
            from ..services.registration_service import ensure_admin_claims

            ensure_admin_claims(firebase_user["uid"], email)
        except Exception:
            pass
    return firebase_user

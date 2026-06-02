import json
import logging
import os
from typing import Any

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

logger = logging.getLogger(__name__)

_firebase_initialized = False


def _load_service_account() -> dict[str, Any] | None:
    json_blob = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if json_blob:
        return json.loads(json_blob)

    path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    if path and os.path.isfile(path):
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    return None


def init_firebase_admin() -> bool:
    global _firebase_initialized
    if _firebase_initialized or firebase_admin._apps:
        _firebase_initialized = True
        return True

    service_account = _load_service_account()
    if not service_account:
        logger.warning(
            "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or "
            "FIREBASE_SERVICE_ACCOUNT_JSON to enable admin approval."
        )
        return False

    cred = credentials.Certificate(service_account)
    firebase_admin.initialize_app(cred)
    _firebase_initialized = True
    logger.info("Firebase Admin SDK initialized")
    return True


def ensure_firebase_admin() -> None:
    if not init_firebase_admin():
        raise RuntimeError(
            "Firebase Admin SDK is not configured on the server. "
            "Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON."
        )


def verify_firebase_id_token(id_token: str) -> dict[str, Any]:
    ensure_firebase_admin()
    return firebase_auth.verify_id_token(id_token)


def set_user_approval_claims(firebase_uid: str, *, approved: bool, role: str = "user") -> None:
    ensure_firebase_admin()
    firebase_auth.set_custom_user_claims(
        firebase_uid,
        {
            "approved": approved,
            "role": role,
        },
    )


def set_admin_role_claim(firebase_uid: str) -> None:
    ensure_firebase_admin()
    firebase_auth.set_custom_user_claims(
        firebase_uid,
        {
            "approved": True,
            "role": "admin",
        },
    )

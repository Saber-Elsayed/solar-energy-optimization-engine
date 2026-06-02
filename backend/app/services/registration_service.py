import logging
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import PyMongoError

from ..config import get_admin_emails
from ..db.mongo import get_app_users_collection
from ..models.registration import RegistrationPublic, RegistrationStatus, RegistrationStatusResponse
from .firebase_admin_service import set_user_approval_claims

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_set_user_claims(firebase_uid: str, *, approved: bool, role: str = "user") -> None:
    """Persist claims when Admin SDK is available; MongoDB remains source of truth if not."""
    try:
        set_user_approval_claims(firebase_uid, approved=approved, role=role)
    except Exception as exc:
        logger.warning("Could not set Firebase custom claims for %s: %s", firebase_uid, exc)


def _to_public(document: dict[str, Any]) -> RegistrationPublic:
    return RegistrationPublic(
        firebase_uid=document["firebase_uid"],
        email=document["email"],
        status=document["status"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
        rejected_reason=document.get("rejected_reason"),
    )


def submit_registration(firebase_uid: str, email: str) -> RegistrationStatusResponse:
    if _is_configured_admin(email, None):
        try:
            ensure_admin_claims(firebase_uid, email)
        except Exception:
            pass
        return RegistrationStatusResponse(
            status="approved",
            email=email,
            approved=True,
            is_admin=True,
        )

    collection = get_app_users_collection()
    now = _utc_now()
    existing = collection.find_one({"firebase_uid": firebase_uid})

    if existing and existing.get("status") == "approved":
        _safe_set_user_claims(firebase_uid, approved=True, role="user")
        return RegistrationStatusResponse(status="approved", email=email, approved=True, is_admin=False)

    if existing and existing.get("status") == "rejected":
        return RegistrationStatusResponse(status="rejected", email=email, approved=False, is_admin=False)

    document = {
        "firebase_uid": firebase_uid,
        "email": email.lower(),
        "status": "pending",
        "created_at": existing["created_at"] if existing else now,
        "updated_at": now,
        "rejected_reason": None,
        "approved_by": None,
    }
    collection.update_one({"firebase_uid": firebase_uid}, {"$set": document}, upsert=True)
    _safe_set_user_claims(firebase_uid, approved=False, role="user")
    return RegistrationStatusResponse(status="pending", email=email, approved=False, is_admin=False)


def _is_configured_admin(email: str, role: str | None) -> bool:
    if role == "admin":
        return True
    return email.lower() in get_admin_emails()


def get_registration_status(firebase_user: dict[str, Any]) -> RegistrationStatusResponse:
    firebase_uid = firebase_user["uid"]
    email = firebase_user.get("email") or ""
    approved_claim = bool(firebase_user.get("approved"))
    role = firebase_user.get("role")

    if _is_configured_admin(email, role):
        try:
            ensure_admin_claims(firebase_uid, email)
        except Exception:
            # Claims update may fail if Firebase Admin is not configured; allowlist still grants admin UI access.
            pass
        return RegistrationStatusResponse(
            status="approved",
            email=email,
            approved=True,
            is_admin=True,
        )

    collection = get_app_users_collection()
    document = collection.find_one({"firebase_uid": firebase_uid})
    if not document:
        return submit_registration(firebase_uid, email)

    status: RegistrationStatus = document.get("status", "pending")
    approved = status == "approved" or approved_claim
    return RegistrationStatusResponse(status=status, email=email, approved=approved, is_admin=False)


def list_registrations(status: RegistrationStatus | None = None) -> list[RegistrationPublic]:
    collection = get_app_users_collection()
    query: dict[str, Any] = {}
    if status:
        query["status"] = status
    cursor = collection.find(query).sort("created_at", -1)
    return [_to_public(doc) for doc in cursor]


def approve_registration(firebase_uid: str, admin_uid: str) -> RegistrationPublic:
    collection = get_app_users_collection()
    now = _utc_now()
    updated = collection.find_one_and_update(
        {"firebase_uid": firebase_uid},
        {
            "$set": {
                "status": "approved",
                "updated_at": now,
                "approved_by": admin_uid,
                "rejected_reason": None,
            }
        },
        return_document=True,
    )
    if not updated:
        raise ValueError("Registration request not found")
    _safe_set_user_claims(firebase_uid, approved=True, role="user")
    return _to_public(updated)


def reject_registration(firebase_uid: str, admin_uid: str, reason: str | None) -> RegistrationPublic:
    collection = get_app_users_collection()
    now = _utc_now()
    updated = collection.find_one_and_update(
        {"firebase_uid": firebase_uid},
        {
            "$set": {
                "status": "rejected",
                "updated_at": now,
                "approved_by": admin_uid,
                "rejected_reason": reason,
            }
        },
        return_document=True,
    )
    if not updated:
        raise ValueError("Registration request not found")
    _safe_set_user_claims(firebase_uid, approved=False, role="user")
    return _to_public(updated)


def ensure_admin_claims(firebase_uid: str, email: str) -> None:
    from .firebase_admin_service import set_admin_role_claim

    collection = get_app_users_collection()
    now = _utc_now()
    collection.update_one(
        {"firebase_uid": firebase_uid},
        {
            "$set": {
                "firebase_uid": firebase_uid,
                "email": email.lower(),
                "status": "approved",
                "updated_at": now,
                "approved_by": "system",
                "rejected_reason": None,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    set_admin_role_claim(firebase_uid)

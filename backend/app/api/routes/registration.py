from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import PyMongoError

from ...models.registration import RegistrationStatusResponse
from ...services.registration_service import get_registration_status, submit_registration
from ...config import get_admin_emails
from ...utils.firebase_deps import get_firebase_user
from ...utils.log_helpers import record_from_firebase_user

router = APIRouter(prefix="/firebase/registration", tags=["firebase-registration"])


@router.post("/submit", response_model=RegistrationStatusResponse)
def register_pending_user(firebase_user: dict[str, Any] = Depends(get_firebase_user)) -> RegistrationStatusResponse:
    email = firebase_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Firebase token is missing email")
    try:
        result = submit_registration(firebase_user["uid"], email)
        record_from_firebase_user(
            firebase_user,
            "REGISTER",
            entity_type="user",
            entity_id=firebase_user["uid"],
            metadata={"status": result.status},
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while saving registration") from exc


@router.get("/status", response_model=RegistrationStatusResponse)
def registration_status(firebase_user: dict[str, Any] = Depends(get_firebase_user)) -> RegistrationStatusResponse:
    try:
        return get_registration_status(firebase_user)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading registration status") from exc


@router.post("/bootstrap-admin")
def bootstrap_admin(firebase_user: dict[str, Any] = Depends(get_firebase_user)) -> dict[str, str]:
    """Grant admin role to allow-listed emails (first-time setup)."""
    email = (firebase_user.get("email") or "").lower()
    if email not in get_admin_emails():
        raise HTTPException(status_code=403, detail="Email is not configured as admin")
    try:
        from ...services.registration_service import ensure_admin_claims

        ensure_admin_claims(firebase_user["uid"], email)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error during admin bootstrap") from exc
    return {"message": "Admin role granted. Sign out and sign in again to refresh permissions."}

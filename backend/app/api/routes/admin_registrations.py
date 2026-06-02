from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import PyMongoError

from ...models.registration import RejectRegistrationRequest, RegistrationPublic, RegistrationStatus
from ...services.registration_service import approve_registration, list_registrations, reject_registration
from ...utils.firebase_deps import get_firebase_admin_user

router = APIRouter(prefix="/admin/registrations", tags=["admin-registrations"])


@router.get("", response_model=list[RegistrationPublic])
def get_registrations(
    status: RegistrationStatus | None = Query(default="pending"),
    _admin: dict[str, Any] = Depends(get_firebase_admin_user),
) -> list[RegistrationPublic]:
    try:
        return list_registrations(status=status)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading registrations") from exc


@router.post("/{firebase_uid}/approve", response_model=RegistrationPublic)
def approve_user(
    firebase_uid: str,
    admin_user: dict[str, Any] = Depends(get_firebase_admin_user),
) -> RegistrationPublic:
    try:
        return approve_registration(firebase_uid, admin_user["uid"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while approving registration") from exc


@router.post("/{firebase_uid}/reject", response_model=RegistrationPublic)
def reject_user(
    firebase_uid: str,
    payload: RejectRegistrationRequest,
    admin_user: dict[str, Any] = Depends(get_firebase_admin_user),
) -> RegistrationPublic:
    try:
        return reject_registration(firebase_uid, admin_user["uid"], payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while rejecting registration") from exc

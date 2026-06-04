from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import PyMongoError

from ...models.log import CreateUserLogRequest, UserLogListResponse, UserLogPublic
from ...services.log_service import log_service
from ...utils.firebase_deps import get_firebase_admin_user, get_optional_firebase_user

router = APIRouter(prefix="/api/logs", tags=["user-logs"])


@router.post("", status_code=201)
async def ingest_activity_log(
    payload: CreateUserLogRequest,
    firebase_user: dict[str, Any] | None = Depends(get_optional_firebase_user),
) -> dict[str, str]:
    """Accept activity events from the mobile app (fire-and-forget on the client)."""
    from ...utils.log_helpers import record_from_firebase_user

    record_from_firebase_user(
        firebase_user,
        payload.action,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        metadata=payload.metadata,
    )
    return {"status": "ok"}


@router.get("", response_model=UserLogListResponse)
def list_activity_logs(
    user_id: str | None = Query(default=None, description="Filter by Firebase UID or legacy user id"),
    user_email: str | None = Query(default=None, description="Filter by user email (partial match)"),
    action: str | None = Query(default=None, description="Filter by action code"),
    exclude_actions: str | None = Query(
        default=None,
        description="Comma-separated action codes to hide (e.g. RUN_OPTIMIZATION,RUN_FORECAST)",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200),
    limit: int | None = Query(default=None, ge=1, le=200, description="Alias for page_size"),
    _admin: dict[str, Any] = Depends(get_firebase_admin_user),
) -> UserLogListResponse:
    resolved_page_size = page_size if page_size is not None else (limit if limit is not None else 50)
    excluded = (
        [part.strip() for part in exclude_actions.split(",") if part.strip()]
        if exclude_actions
        else None
    )
    try:
        items, total = log_service.list_logs(
            user_id=user_id,
            user_email=user_email,
            action=action,
            exclude_actions=excluded,
            page=page,
            page_size=resolved_page_size,
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading logs") from exc
    return UserLogListResponse(items=items, total=total, page=page, page_size=resolved_page_size)


@router.get("/recent", response_model=list[UserLogPublic])
def list_recent_activity_logs(
    limit: int = Query(default=50, ge=1, le=200),
    _admin: dict[str, Any] = Depends(get_firebase_admin_user),
) -> list[UserLogPublic]:
    try:
        return log_service.list_recent(limit=limit)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading recent logs") from exc

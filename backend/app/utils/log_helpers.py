"""Helpers for recording user activity without affecting main request flow."""

from typing import Any

from ..models.device import DeviceItem
from ..models.log import DEV_LOG_USER_EMAIL, DEV_LOG_USER_ID
from ..services.log_service import log_service


def record_activity(
    action: str,
    *,
    user_id: str = DEV_LOG_USER_ID,
    user_email: str = DEV_LOG_USER_EMAIL,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    log_service.create_log_sync(
        user_id=user_id,
        user_email=user_email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata,
    )


def _resolve_log_email(firebase_user: dict[str, Any] | None, metadata: dict[str, Any] | None) -> str:
    if firebase_user and firebase_user.get("email"):
        return str(firebase_user["email"])
    meta_email = (metadata or {}).get("email")
    if isinstance(meta_email, str) and meta_email.strip():
        return meta_email.strip()
    return DEV_LOG_USER_EMAIL


def record_from_firebase_user(
    firebase_user: dict[str, Any] | None,
    action: str,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    user_id = (firebase_user or {}).get("uid") or DEV_LOG_USER_ID
    user_email = _resolve_log_email(firebase_user, metadata)
    record_activity(
        action,
        user_id=user_id,
        user_email=user_email,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata,
    )


def build_optimization_metadata(
    *,
    strategy: str,
    soc: float,
    available_energy_wh: float,
    inverter_limit_w: float,
    allowed_devices_count: int,
    blocked_devices_count: int,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "strategy": strategy,
        "soc": soc,
        "available_energy_wh": available_energy_wh,
        "inverter_limit_w": inverter_limit_w,
        "allowed_devices_count": allowed_devices_count,
        "blocked_devices_count": blocked_devices_count,
    }
    if extra:
        payload.update(extra)
    return payload


def device_action_metadata(device: DeviceItem) -> dict[str, Any]:
    return {
        "device_name": device.name,
        "power_w": device.power,
        "duration_hours": round(device.duration / 60, 4),
    }


def solar_setting_change_metadata(*, field: str, old_value: float | None, new_value: float) -> dict[str, Any]:
    return {
        "field": field,
        "old_value": old_value,
        "new_value": new_value,
    }

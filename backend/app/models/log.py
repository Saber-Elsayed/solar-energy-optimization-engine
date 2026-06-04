from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

LogAction = Literal[
    "LOGIN",
    "LOGOUT",
    "REGISTER",
    "CREATE_DEVICE",
    "UPDATE_DEVICE",
    "DELETE_DEVICE",
    "UPDATE_BATTERY_CAPACITY",
    "UPDATE_INVERTER_LIMIT",
    "RUN_OPTIMIZATION",
    "SELECT_PLAN",
    "RUN_FORECAST",
]

DEV_LOG_USER_ID = "dev-solar-user"
DEV_LOG_USER_EMAIL = ""


class CreateUserLogRequest(BaseModel):
    action: LogAction
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: str | None = Field(default=None, max_length=128)
    metadata: dict[str, Any] = Field(default_factory=dict)


class UserLogPublic(BaseModel):
    id: str
    user_id: str
    user_email: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class UserLogListResponse(BaseModel):
    items: list[UserLogPublic]
    total: int
    page: int
    page_size: int

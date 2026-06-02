from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

RegistrationStatus = Literal["pending", "approved", "rejected"]


class RegistrationPublic(BaseModel):
    firebase_uid: str
    email: EmailStr
    status: RegistrationStatus
    created_at: datetime
    updated_at: datetime
    rejected_reason: str | None = None


class RegistrationStatusResponse(BaseModel):
    status: RegistrationStatus
    email: EmailStr
    approved: bool
    is_admin: bool = False


class RejectRegistrationRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)

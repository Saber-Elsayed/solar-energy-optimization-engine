from datetime import datetime

from pydantic import BaseModel, Field


class UserCreateRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)
    city: str = ""


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    city: str
    created_at: datetime | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


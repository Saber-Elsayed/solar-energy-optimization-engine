from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from app.db import get_users_collection
from app.services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    parse_bearer_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)
    city: str = Field(default="")


class LoginRequest(BaseModel):
    email: str
    password: str


def _serialize_user(user_doc: dict) -> dict:
    return {
        "id": str(user_doc["_id"]),
        "email": user_doc["email"],
        "name": user_doc.get("name", ""),
        "city": user_doc.get("city", ""),
        "created_at": user_doc.get("created_at"),
    }


@router.post("/register")
def register(payload: RegisterRequest) -> dict:
    users = get_users_collection()
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    if users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    document = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "city": payload.city.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = users.insert_one(document)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to register user") from exc

    user = users.find_one({"_id": result.inserted_id})
    if not user:
        raise HTTPException(status_code=500, detail="Failed to load created user")
    token = create_access_token(str(user["_id"]), user["email"])
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    users = get_users_collection()
    email = payload.email.strip().lower()
    user = users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["_id"]), user["email"])
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.get("/me")
def me(authorization: str | None = Header(default=None)) -> dict:
    try:
        token = parse_bearer_token(authorization)
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = get_users_collection().find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return _serialize_user(user)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


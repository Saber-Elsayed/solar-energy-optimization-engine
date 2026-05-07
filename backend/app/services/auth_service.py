from datetime import datetime, timezone

from pymongo.errors import PyMongoError

from ..db.mongo import get_users_collection
from ..models.user import AuthResponse, UserCreateRequest, UserLoginRequest, UserPublic
from ..utils.security import create_access_token, hash_password, verify_password


def _serialize_user(user_doc: dict) -> UserPublic:
    return UserPublic(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        name=user_doc.get("name", ""),
        city=user_doc.get("city", ""),
        created_at=user_doc.get("created_at"),
    )


def register_user(payload: UserCreateRequest) -> AuthResponse:
    users = get_users_collection()
    email = payload.email.strip().lower()
    if not email:
        raise ValueError("Email is required")
    if users.find_one({"email": email}):
        raise RuntimeError("Email already registered")

    document = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "city": payload.city.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    result = users.insert_one(document)
    created_user = users.find_one({"_id": result.inserted_id})
    if not created_user:
        raise PyMongoError("Failed to load created user")

    token = create_access_token(str(created_user["_id"]), created_user["email"])
    return AuthResponse(access_token=token, user=_serialize_user(created_user))


def login_user(payload: UserLoginRequest) -> AuthResponse:
    users = get_users_collection()
    email = payload.email.strip().lower()
    user = users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise PermissionError("Invalid email or password")
    token = create_access_token(str(user["_id"]), user["email"])
    return AuthResponse(access_token=token, user=_serialize_user(user))


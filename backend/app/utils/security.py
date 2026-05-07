import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import Header, HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

from ..db.mongo import get_users_collection
from ..models.user import UserPublic

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str, email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expires}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def parse_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return authorization[len(prefix) :]


def _serialize_user(user_doc: dict) -> UserPublic:
    return UserPublic(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        name=user_doc.get("name", ""),
        city=user_doc.get("city", ""),
        created_at=user_doc.get("created_at"),
    )


def get_current_user(authorization: str | None = Header(default=None)) -> UserPublic:
    print(f"[AUTH DEBUG] Authorization header received: {authorization}")
    token = parse_bearer_token(authorization)
    try:
        payload = decode_access_token(token)
        print(f"[AUTH DEBUG] Decoded JWT payload: {payload}")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = get_users_collection().find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        print(f"[AUTH DEBUG] Authenticated user_id: {user_id}, email: {user.get('email')}")
        return _serialize_user(user)
    except HTTPException:
        raise
    except (JWTError, Exception) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


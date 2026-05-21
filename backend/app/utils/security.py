import os
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError
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


def create_access_token(*, user_id: str, email: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expires_at}
    print(
        "[JWT DEBUG] encode config",
        {
            "algorithm": JWT_ALGORITHM,
            "secret_len": len(JWT_SECRET),
            "payload_sub": user_id,
            "payload_email": email,
            "payload_exp": expires_at.isoformat(),
        },
    )
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return authorization[7:]


def get_current_user(authorization: str | None = Header(default=None)) -> UserPublic:
    try:
        token = extract_bearer_token(authorization)
        print("[JWT DEBUG] TOKEN:", token)
        print("[JWT DEBUG] decode config", {"algorithm": JWT_ALGORITHM, "secret_len": len(JWT_SECRET)})
        payload = decode_access_token(token)
        print("[JWT DEBUG] PAYLOAD:", payload)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        print("[JWT DEBUG] user_id:", user_id)
        print("[JWT DEBUG] user_id type:", type(user_id))
        try:
            object_id = ObjectId(user_id)
        except (InvalidId, TypeError, ValueError) as exc:
            print("[JWT DEBUG] ObjectId conversion error:", type(exc).__name__, repr(exc))
            raise HTTPException(status_code=401, detail="Invalid user id in token") from exc
        user = get_users_collection().find_one({"_id": object_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return UserPublic(
            id=str(user["_id"]),
            email=user["email"],
            name=user.get("name", ""),
            created_at=user.get("created_at"),
        )
    except HTTPException:
        raise
    except ExpiredSignatureError as exc:
        print("[JWT DEBUG] ExpiredSignatureError:", repr(exc))
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except JWTClaimsError as exc:
        print("[JWT DEBUG] JWTClaimsError:", repr(exc))
        raise HTTPException(status_code=401, detail="Invalid token claims") from exc
    except JWTError as exc:
        print("[JWT DEBUG] JWTError:", repr(exc))
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    except Exception as exc:
        print("[JWT DEBUG] Unexpected auth error:", type(exc).__name__, repr(exc))
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import PyMongoError

from ...models.user import AuthResponse, UserLoginRequest, UserPublic, UserRegisterRequest
from ...services.auth_service import login_user, register_user
from ...utils.log_helpers import record_activity
from ...utils.security import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: UserRegisterRequest) -> AuthResponse:
    try:
        response = register_user(payload)
        record_activity(
            "REGISTER",
            user_id=response.user.id,
            user_email=response.user.email,
            entity_type="user",
            entity_id=response.user.id,
        )
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to register user") from exc


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest) -> AuthResponse:
    try:
        response = login_user(payload)
        record_activity(
            "LOGIN",
            user_id=response.user.id,
            user_email=response.user.email,
            entity_type="user",
            entity_id=response.user.id,
        )
        return response
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to login user") from exc


@router.get("/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user


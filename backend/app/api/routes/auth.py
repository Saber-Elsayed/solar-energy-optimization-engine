from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import PyMongoError

from ...models.user import AuthResponse, UserCreateRequest, UserLoginRequest, UserPublic
from ...services.auth_service import login_user, register_user
from ...utils.security import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: UserCreateRequest) -> AuthResponse:
    try:
        return register_user(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to register user") from exc


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest) -> AuthResponse:
    try:
        return login_user(payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to login") from exc


@router.get("/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user


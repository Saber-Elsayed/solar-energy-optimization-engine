from fastapi import APIRouter, HTTPException
from pymongo.errors import PyMongoError

from ...models.solar_system import SolarSystemPayload, SolarSystemResponse, SolarSystemSaveResponse
from ...services.solar_system_service import create_solar_system, get_solar_system, upsert_solar_system

router = APIRouter(tags=["solar-system"])
DEV_SOLAR_USER_ID = "dev-solar-user"


@router.post("/solar-system", response_model=SolarSystemSaveResponse, status_code=201)
def create_profile(payload: SolarSystemPayload) -> SolarSystemSaveResponse:
    try:
        print("[SOLAR DEBUG] POST /solar-system payload:", payload.model_dump())
        profile = create_solar_system(user_id=DEV_SOLAR_USER_ID, payload=payload)
        return SolarSystemSaveResponse(success=True, operation="created", data=profile)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to create solar system profile") from exc


@router.get("/solar-system", response_model=SolarSystemResponse)
def get_profile() -> SolarSystemResponse:
    try:
        profile = get_solar_system(user_id=DEV_SOLAR_USER_ID)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to load solar system profile") from exc
    if not profile:
        raise HTTPException(status_code=404, detail="Solar system profile not found")
    return profile


@router.put("/solar-system", response_model=SolarSystemSaveResponse)
def update_profile(payload: SolarSystemPayload) -> SolarSystemSaveResponse:
    try:
        print("[SOLAR DEBUG] PUT /solar-system payload:", payload.model_dump())
        profile = upsert_solar_system(user_id=DEV_SOLAR_USER_ID, payload=payload)
        return SolarSystemSaveResponse(success=True, operation="updated", data=profile)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to update solar system profile") from exc


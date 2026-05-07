import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo.errors import PyMongoError

from ...models.energy import EnergyDataRequest
from ...models.user import UserPublic
from ...services import energy_service
from ...utils.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/energy-data")
async def receive_energy_data(
    request: Request, payload: EnergyDataRequest, current_user: UserPublic = Depends(get_current_user)
):
    raw_payload = await request.json()
    print(f"[DEBUG] Raw incoming /energy-data JSON: {raw_payload}")
    try:
        inserted_id = energy_service.save_energy_data(payload, current_user.id)
    except PyMongoError as exc:
        logger.exception("Failed to save energy data")
        raise HTTPException(status_code=500, detail="Failed to save energy data") from exc
    return {"status": "ok", "id": inserted_id}


@router.get("/energy-data")
def list_energy_data(current_user: UserPublic = Depends(get_current_user)) -> List[dict]:
    try:
        records = energy_service.list_energy_data(current_user.id)
    except PyMongoError as exc:
        logger.exception("Failed to load energy data")
        raise HTTPException(status_code=500, detail="Failed to fetch energy data") from exc
    print(f"[DEBUG] Energy records retrieved from MongoDB: {records}")
    return records


@router.get("/energy-data/latest")
def latest_energy_data(current_user: UserPublic = Depends(get_current_user)) -> dict:
    try:
        latest = energy_service.get_latest_energy(current_user.id)
    except PyMongoError as exc:
        logger.exception("Failed to load latest energy data")
        raise HTTPException(status_code=500, detail="Failed to fetch latest energy data") from exc

    if latest is None:
        raise HTTPException(status_code=404, detail="No energy data found")
    return latest


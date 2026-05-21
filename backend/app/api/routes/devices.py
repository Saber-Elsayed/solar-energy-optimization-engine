import logging
from typing import List

from fastapi import APIRouter, HTTPException
from bson.errors import InvalidId
from pymongo.errors import PyMongoError

from ...models.device import DeviceItem, DeviceSaveResponse
from ...services import device_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/devices", response_model=DeviceSaveResponse, status_code=201)
def create_device(device: DeviceItem) -> DeviceSaveResponse:
    print(f"[DEBUG] Incoming /devices payload: {device.model_dump()}")
    try:
        inserted_id = device_service.create_device(device)
        print(f"[DEBUG] Device inserted into MongoDB, inserted_id={inserted_id}")
    except PyMongoError as exc:
        print(f"[DEBUG] Device insert failed: {exc}")
        logger.exception("Failed to save device")
        raise HTTPException(status_code=500, detail="Failed to save device") from exc
    return DeviceSaveResponse(success=True, operation="created", id=inserted_id)


@router.get("/devices")
def list_devices() -> List[dict]:
    try:
        return device_service.list_devices()
    except PyMongoError as exc:
        logger.exception("Failed to fetch devices")
        raise HTTPException(status_code=500, detail="Failed to fetch devices") from exc


@router.put("/devices/{device_id}", response_model=DeviceSaveResponse)
def update_device(device_id: str, device: DeviceItem) -> DeviceSaveResponse:
    try:
        found, returned_id = device_service.update_device(device_id, device)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc
    except PyMongoError as exc:
        logger.exception("Failed to update device")
        raise HTTPException(status_code=500, detail="Failed to update device") from exc

    if not found:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceSaveResponse(success=True, operation="updated", id=returned_id)


@router.delete("/devices/{device_id}")
def delete_device(device_id: str) -> dict:
    try:
        found, returned_id = device_service.delete_device(device_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc
    except PyMongoError as exc:
        logger.exception("Failed to delete device")
        raise HTTPException(status_code=500, detail="Failed to delete device") from exc

    if not found:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "ok", "id": returned_id}


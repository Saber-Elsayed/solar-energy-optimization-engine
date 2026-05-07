from datetime import datetime, timezone
from typing import List

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import PyMongoError

from app.db import get_devices_collection, get_energy_collection, get_users_collection
from app.services.auth_service import decode_access_token, parse_bearer_token

router = APIRouter(tags=["user-data"])


class DeviceItem(BaseModel):
    name: str = Field(..., min_length=1)
    power: float = Field(..., gt=0)
    duration: int = Field(..., gt=0)
    priority: int = Field(..., ge=1, le=5)
    essential: bool
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")


class EnergyDataRequest(BaseModel):
    voltage: float
    current: float
    soc: float | None = Field(default=None, ge=0, le=100)
    model_config = ConfigDict(extra="ignore")


def _current_user_id(authorization: str | None) -> str:
    try:
        token = parse_bearer_token(authorization)
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        if not get_users_collection().find_one({"_id": ObjectId(user_id)}):
            raise HTTPException(status_code=401, detail="User not found")
        return user_id
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


@router.post("/devices")
def create_device(device: DeviceItem, authorization: str | None = Header(default=None)) -> dict:
    user_id = _current_user_id(authorization)
    payload = {**device.model_dump(), "user_id": user_id}
    try:
        result = get_devices_collection().insert_one(payload)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to save device") from exc
    return {"status": "ok", "id": str(result.inserted_id)}


@router.get("/devices")
def list_devices(authorization: str | None = Header(default=None)) -> List[dict]:
    user_id = _current_user_id(authorization)
    try:
        records = list(
            get_devices_collection().find(
                {"user_id": user_id},
                {"_id": 1, "name": 1, "power": 1, "duration": 1, "priority": 1, "essential": 1, "start_time": 1, "end_time": 1},
            )
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch devices") from exc
    return [
        {
            "id": str(rec["_id"]),
            "name": rec["name"],
            "power": rec["power"],
            "duration": rec["duration"],
            "priority": rec["priority"],
            "essential": rec["essential"],
            "start_time": rec["start_time"],
            "end_time": rec["end_time"],
        }
        for rec in records
    ]


@router.put("/devices/{device_id}")
def update_device(device_id: str, device: DeviceItem, authorization: str | None = Header(default=None)) -> dict:
    user_id = _current_user_id(authorization)
    try:
        obj_id = ObjectId(device_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc
    try:
        result = get_devices_collection().update_one({"_id": obj_id, "user_id": user_id}, {"$set": device.model_dump()})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to update device") from exc
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "ok", "id": device_id}


@router.delete("/devices/{device_id}")
def delete_device(device_id: str, authorization: str | None = Header(default=None)) -> dict:
    user_id = _current_user_id(authorization)
    try:
        obj_id = ObjectId(device_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc
    try:
        result = get_devices_collection().delete_one({"_id": obj_id, "user_id": user_id})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to delete device") from exc
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"status": "ok", "id": device_id}


@router.post("/energy-data")
def create_energy_data(payload: EnergyDataRequest, authorization: str | None = Header(default=None)) -> dict:
    user_id = _current_user_id(authorization)
    document = {**payload.model_dump(), "user_id": user_id, "timestamp": datetime.now(timezone.utc)}
    try:
        result = get_energy_collection().insert_one(document)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to save energy data") from exc
    return {"status": "ok", "id": str(result.inserted_id)}


@router.get("/energy-data")
def list_energy_data(authorization: str | None = Header(default=None)) -> List[dict]:
    user_id = _current_user_id(authorization)
    try:
        records = list(get_energy_collection().find({"user_id": user_id}, {"_id": 0, "user_id": 0}))
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch energy data") from exc
    return records


@router.get("/energy-data/latest")
def latest_energy_data(authorization: str | None = Header(default=None)) -> dict:
    user_id = _current_user_id(authorization)
    try:
        latest = get_energy_collection().find_one({"user_id": user_id}, {"_id": 0, "user_id": 0}, sort=[("timestamp", -1)])
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch latest energy data") from exc
    if latest is None:
        raise HTTPException(status_code=404, detail="No energy data found")
    return latest


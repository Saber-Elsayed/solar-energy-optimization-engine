from typing import List

from bson import ObjectId
from pymongo.errors import PyMongoError

from ..db.mongo import get_devices_collection
from ..models.device import DeviceItem


def create_device(device: DeviceItem) -> str:
    result = get_devices_collection().insert_one(device.model_dump())
    return str(result.inserted_id)


def list_devices() -> List[dict]:
    records = list(
        get_devices_collection().find(
            {},
            {
                "_id": 1,
                "name": 1,
                "power": 1,
                "duration": 1,
                "priority": 1,
                "essential": 1,
                "start_time": 1,
                "end_time": 1,
            },
        )
    )
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


def update_device(device_id: str, device: DeviceItem) -> tuple[bool, str]:
    obj_id = ObjectId(device_id)
    result = get_devices_collection().update_one({"_id": obj_id}, {"$set": device.model_dump()})
    return result.matched_count > 0, device_id


def delete_device(device_id: str) -> tuple[bool, str]:
    obj_id = ObjectId(device_id)
    result = get_devices_collection().delete_one({"_id": obj_id})
    return result.deleted_count > 0, device_id


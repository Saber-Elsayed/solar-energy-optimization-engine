from datetime import datetime, timezone
from typing import List

from pymongo.errors import PyMongoError

from ..db.mongo import get_energy_collection
from ..models.energy import EnergyDataRequest


def save_energy_data(payload: EnergyDataRequest, user_id: str) -> str:
    document = {**payload.model_dump(), "user_id": user_id, "timestamp": datetime.now(timezone.utc)}
    result = get_energy_collection().insert_one(document)
    return str(result.inserted_id)


def list_energy_data(user_id: str) -> List[dict]:
    return list(get_energy_collection().find({"user_id": user_id}, {"_id": 0, "user_id": 0}))


def get_latest_energy(user_id: str) -> dict | None:
    return get_energy_collection().find_one({"user_id": user_id}, {"_id": 0, "user_id": 0}, sort=[("timestamp", -1)])


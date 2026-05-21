from datetime import datetime, timezone
from typing import List

from pymongo.errors import PyMongoError

from ..db.mongo import get_energy_collection
from ..models.energy import EnergyDataRequest


def save_energy_data(payload: EnergyDataRequest) -> str:
    document = {**payload.model_dump(), "timestamp": datetime.now(timezone.utc)}
    result = get_energy_collection().insert_one(document)
    return str(result.inserted_id)


def list_energy_data() -> List[dict]:
    return list(get_energy_collection().find({}, {"_id": 0}))


def get_latest_energy() -> dict | None:
    return get_energy_collection().find_one({}, {"_id": 0}, sort=[("timestamp", -1)])


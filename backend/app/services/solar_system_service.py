from datetime import datetime, timezone

from pymongo.collection import ReturnDocument

from ..db.mongo import get_solar_systems_collection
from ..models.solar_system import SolarSystemPayload, SolarSystemResponse


def _to_response(document: dict) -> SolarSystemResponse:
    return SolarSystemResponse(
        id=str(document["_id"]),
        user_id=document["user_id"],
        battery_capacity_wh=document["battery_capacity_wh"],
        inverter_max_power_w=document["inverter_max_power_w"],
        created_at=document.get("created_at"),
        updated_at=document.get("updated_at"),
    )


def create_solar_system(*, user_id: str, payload: SolarSystemPayload) -> SolarSystemResponse:
    collection = get_solar_systems_collection()
    print("[SOLAR DEBUG] create payload:", payload.model_dump())
    if collection.find_one({"user_id": user_id}):
        raise RuntimeError("Solar system profile already exists")

    now = datetime.now(timezone.utc)
    result = collection.insert_one(
        {
            "user_id": user_id,
            **payload.model_dump(),
            "created_at": now,
            "updated_at": now,
        }
    )
    print("[SOLAR DEBUG] insert_one result:", {"inserted_id": str(result.inserted_id)})
    created = collection.find_one({"_id": result.inserted_id})
    print("[SOLAR DEBUG] created document:", created)
    if not created:
        raise RuntimeError("Failed to load created solar system profile")
    return _to_response(created)


def get_solar_system(*, user_id: str) -> SolarSystemResponse | None:
    document = get_solar_systems_collection().find_one({"user_id": user_id})
    print("[SOLAR DEBUG] get document:", document)
    if not document:
        return None
    return _to_response(document)


def upsert_solar_system(*, user_id: str, payload: SolarSystemPayload) -> SolarSystemResponse:
    now = datetime.now(timezone.utc)
    print("[SOLAR DEBUG] upsert payload:", payload.model_dump())
    updated = get_solar_systems_collection().find_one_and_update(
        {"user_id": user_id},
        {
            "$set": {
                **payload.model_dump(),
                "updated_at": now,
            },
            "$unset": {
                "solar_panel_power_w": "",
                "min_soc_threshold": "",
            },
            "$setOnInsert": {
                "user_id": user_id,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    print("[SOLAR DEBUG] upsert returned document:", updated)
    if not updated:
        raise RuntimeError("Failed to save solar system profile")
    return _to_response(updated)


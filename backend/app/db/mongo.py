import os
from typing import Final

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

MONGO_URI: Final[str] = os.getenv("MONGO_URI", "mongodb://localhost:27017")
_mongo_client: MongoClient = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)


def _get_client() -> MongoClient:
    """Return a healthy MongoDB client, reconnecting if needed."""
    global _mongo_client
    try:
        _mongo_client.admin.command("ping")
    except PyMongoError:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _mongo_client.admin.command("ping")
    return _mongo_client


def get_db() -> Database:
    return _get_client()["energy_db"]


def get_energy_collection() -> Collection:
    return get_db()["energy"]


def get_devices_collection() -> Collection:
    return get_db()["devices"]


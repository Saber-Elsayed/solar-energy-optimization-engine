import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import PyMongoError

from ..db.mongo import get_user_logs_collection
from ..models.log import UserLogPublic

logger = logging.getLogger(__name__)


class LogService:
    """Centralized user activity logging for auditing and future admin dashboards."""

    def ensure_indexes(self) -> None:
        try:
            collection = get_user_logs_collection()
            collection.create_index([("created_at", -1)])
            collection.create_index("user_id")
            collection.create_index("user_email")
            collection.create_index("action")
        except PyMongoError as exc:
            logger.warning("Could not ensure user_logs indexes: %s", exc)

    def _insert_log(
        self,
        *,
        user_id: str,
        user_email: str,
        action: str,
        entity_type: str | None,
        entity_id: str | None,
        metadata: dict[str, Any] | None,
    ) -> None:
        document = {
            "user_id": user_id,
            "user_email": user_email or "",
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc),
        }
        get_user_logs_collection().insert_one(document)

    def create_log_sync(
        self,
        user_id: str,
        user_email: str,
        action: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        try:
            self._insert_log(
                user_id=user_id,
                user_email=user_email,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata=metadata,
            )
        except Exception as exc:
            print(f"[log_service] Warning: failed to record activity ({action}): {exc}")

    async def create_log(
        self,
        user_id: str,
        user_email: str,
        action: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        try:
            await asyncio.to_thread(
                self._insert_log,
                user_id=user_id,
                user_email=user_email,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata=metadata,
            )
        except Exception as exc:
            print(f"[log_service] Warning: failed to record activity ({action}): {exc}")

    @staticmethod
    def _as_utc_datetime(value: Any) -> datetime:
        if not isinstance(value, datetime):
            return datetime.now(timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _serialize(self, document: dict[str, Any]) -> UserLogPublic:
        return UserLogPublic(
            id=str(document["_id"]),
            user_id=document.get("user_id", ""),
            user_email=document.get("user_email", ""),
            action=document.get("action", ""),
            entity_type=document.get("entity_type"),
            entity_id=document.get("entity_id"),
            metadata=document.get("metadata") or {},
            created_at=self._as_utc_datetime(document.get("created_at")),
        )

    def list_logs(
        self,
        *,
        user_id: str | None = None,
        user_email: str | None = None,
        action: str | None = None,
        exclude_actions: list[str] | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[UserLogPublic], int]:
        query: dict[str, Any] = {}
        if user_id:
            query["user_id"] = user_id
        if user_email:
            query["user_email"] = {"$regex": user_email.strip(), "$options": "i"}
        if action:
            query["action"] = action
        elif exclude_actions:
            query["action"] = {"$nin": [item for item in exclude_actions if item]}

        page = max(1, page)
        page_size = min(max(1, page_size), 200)
        skip = (page - 1) * page_size

        collection = get_user_logs_collection()
        total = collection.count_documents(query)
        cursor = collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._serialize(doc) for doc in cursor]
        return items, total

    def list_recent(self, *, limit: int = 50) -> list[UserLogPublic]:
        limit = min(max(1, limit), 200)
        cursor = get_user_logs_collection().find({}).sort("created_at", -1).limit(limit)
        return [self._serialize(doc) for doc in cursor]


log_service = LogService()

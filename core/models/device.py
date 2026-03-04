"""Device domain models.

Responsibility:
- Represent controllable loads (devices) that may be scheduled/curtailed.
- Provide a normalized device description used by the optimizer.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DeviceWindow(BaseModel):
    """Optional time window during which a device may run."""

    earliest_start: Optional[datetime] = None
    latest_end: Optional[datetime] = None


class Device(BaseModel):
    """A controllable electrical device/load (simplified)."""

    device_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    power_kw: float = Field(..., gt=0)
    duration_minutes: int = Field(..., gt=0)
    window: Optional[DeviceWindow] = None
    priority: int = Field(0, description="Higher means more important.")


from typing import Literal

from pydantic import BaseModel, Field


class DeviceItem(BaseModel):
    """A device candidate for optimization and device CRUD payloads."""

    name: str = Field(..., min_length=1, description="Human-readable device label.")
    power: float = Field(..., gt=0, description="Energy demand placeholder used by this mock optimizer.")
    duration: int = Field(..., gt=0, description="Intended runtime in minutes.")
    priority: int = Field(..., ge=1, le=5, description="Priority from 1 (low) to 5 (high).")
    essential: bool = Field(..., description="Essential devices are scheduled before non-essential devices.")
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule start time in HH:MM.")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule end time in HH:MM.")


class DeviceSaveResponse(BaseModel):
    success: bool
    operation: Literal["created", "updated"]
    id: str


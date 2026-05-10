from datetime import datetime

from pydantic import BaseModel, Field


class SolarSystemPayload(BaseModel):
    battery_capacity_wh: float = Field(..., gt=0)
    inverter_max_power_w: float = Field(..., gt=0)


class SolarSystemResponse(SolarSystemPayload):
    id: str
    user_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SolarSystemSaveResponse(BaseModel):
    success: bool
    operation: str
    data: SolarSystemResponse


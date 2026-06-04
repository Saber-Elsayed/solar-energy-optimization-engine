from pydantic import BaseModel, ConfigDict, Field


class EnergyDataRequest(BaseModel):
    voltage: float
    current: float
    soc: float | None = Field(default=None, ge=0, le=100)
    battery_temperature: float = Field(default=0, description="Battery temperature (°C) from controller")
    model_config = ConfigDict(extra="ignore")


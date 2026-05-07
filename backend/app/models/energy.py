from pydantic import BaseModel, ConfigDict, Field


class EnergyDataRequest(BaseModel):
    voltage: float
    current: float
    soc: float | None = Field(default=None, ge=0, le=100)
    model_config = ConfigDict(extra="ignore")


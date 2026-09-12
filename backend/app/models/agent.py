from pydantic import BaseModel, Field

from .device import DeviceItem
from .optimization import BestCombinationResponse, ForecastPoint, WeatherInfo


class AgentRecommendRequest(BaseModel):
    """Natural-language request. Devices/battery are loaded from existing MVP stores."""

    message: str = Field(default="", description="User energy request in natural language.")
    city: str = Field(default="Tel Aviv", min_length=1)


class AgentContext(BaseModel):
    city: str
    devices: list[DeviceItem] = Field(default_factory=list)
    battery_capacity_wh: float
    inverter_max_power_w: float
    soc_percent: float
    available_energy_wh: float
    current_time_hhmm: str
    weather: WeatherInfo | None = None
    forecast_points: list[ForecastPoint] = Field(default_factory=list)


class AgentRecommendResponse(BaseModel):
    message: str
    tools_used: list[str]
    explanation: str
    context: AgentContext
    plan: BestCombinationResponse
    rag_sources: list[str] = Field(default_factory=list)

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from .device import DeviceItem


class OptimizeRequest(BaseModel):
    """Body for POST /optimize: a list of devices to consider."""

    city: str = Field(..., min_length=1, description="City used to fetch weather-based energy estimate.")
    devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices the optimizer should take into account (may be empty).",
    )


class CannotRunItem(BaseModel):
    """A rejected device with an explanation."""

    device: DeviceItem
    reason: str = Field(..., description="Reason the device cannot run right now.")
    blocked_reason: str = Field(
        ...,
        description="Human-readable explanation for why the device was blocked.",
    )
    exceeded_constraint: str = Field(
        ...,
        description="Constraint identifier that was violated (e.g. schedule, inverter_power, available_energy).",
    )


class OptimizeResponse(BaseModel):
    """One optimization scenario result based on the current constraints."""

    can_run: List[DeviceItem] = Field(default_factory=list)
    cannot_run: List[CannotRunItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0, description="Energy left after scheduling.")


class ScenarioResult(BaseModel):
    """A named strategy and its optimization output."""

    name: str
    can_run: List[DeviceItem] = Field(default_factory=list)
    cannot_run: List[CannotRunItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0)


class ForecastPoint(BaseModel):
    """Mock forecast input point for one hour."""

    hour: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    energy: float = Field(..., ge=0)


class ForecastHourResult(BaseModel):
    """Optimization output for one forecasted hour."""

    hour: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    can_run: List[DeviceItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0)


class WeatherInfo(BaseModel):
    """Weather summary used by the optimizer."""

    city: str
    condition: str
    energy_estimate: float = Field(..., ge=0)
    temperature: float | None = None


class MultiScenarioResponse(BaseModel):
    """Response wrapper that returns multiple optimization strategies."""

    scenarios: List[ScenarioResult] = Field(default_factory=list)
    forecast: List[ForecastHourResult] = Field(default_factory=list)
    forecast_points: List[ForecastPoint] = Field(
        default_factory=list,
        description="12-hour solar energy forecast inputs used for forward planning.",
    )
    alerts: List[str] = Field(default_factory=list)
    weather: WeatherInfo


class BestCombinationResponse(BaseModel):
    """OR-Tools optimal subset under inverter, energy, schedule, and essential/optional rules."""

    can_run: List[DeviceItem] = Field(default_factory=list)
    cannot_run: List[CannotRunItem] = Field(default_factory=list)
    total_power_w: float = Field(..., ge=0)
    total_energy_wh: float = Field(..., ge=0)
    remaining_energy_wh: float = Field(..., ge=0)
    objective_score: int = Field(..., ge=0, description="Weighted priority score of the selected set.")
    solver_status: str = Field(
        ...,
        description="OPTIMAL, FEASIBLE, INFEASIBLE, or UNAVAILABLE (ortools not installed).",
    )


"""Load live MVP state for the agent. Does not invent devices, SOC, or solar profile."""

from __future__ import annotations

from datetime import datetime

from ...models.agent import AgentContext
from ...models.device import DeviceItem
from ...models.optimization import WeatherInfo
from ..device_service import list_devices
from ..optimization_service import (
    build_current_constraints,
    hhmm_to_minutes,
    resolve_battery_capacity_and_inverter,
    resolve_soc_percent,
)
from ..weather_service import fetch_weather_and_forecast

CONTEXT_TOOL_NAME = "context"


def _records_to_device_items(records: list[dict]) -> list[DeviceItem]:
    items: list[DeviceItem] = []
    for rec in records:
        items.append(
            DeviceItem(
                name=rec["name"],
                power=float(rec["power"]),
                duration=int(rec["duration"]),
                priority=int(rec["priority"]),
                essential=bool(rec["essential"]),
                start_time=rec.get("start_time") or "00:00",
                end_time=rec.get("end_time") or "23:59",
            )
        )
    return items


def gather_agent_context(city: str) -> AgentContext:
    city_name = city.strip() or "Tel Aviv"
    devices = _records_to_device_items(list_devices())
    battery_capacity_wh, inverter_max_power_w = resolve_battery_capacity_and_inverter()
    soc_percent = resolve_soc_percent()
    constraints = build_current_constraints(
        battery_capacity_wh=battery_capacity_wh,
        soc_percent=soc_percent,
        inverter_max_power_w=inverter_max_power_w,
    )

    weather: WeatherInfo | None = None
    forecast_points = []
    fallback_time = datetime.now().strftime("%H:%M")
    current_time_hhmm = fallback_time
    try:
        weather, forecast_points = fetch_weather_and_forecast(city_name)
        if forecast_points:
            current_time_hhmm = forecast_points[0].hour
    except Exception:
        weather = None
        forecast_points = []
        current_time_hhmm = fallback_time

    return AgentContext(
        city=city_name,
        devices=devices,
        battery_capacity_wh=battery_capacity_wh,
        inverter_max_power_w=inverter_max_power_w,
        soc_percent=soc_percent,
        available_energy_wh=constraints.available_energy_wh,
        current_time_hhmm=current_time_hhmm,
        weather=weather,
        forecast_points=forecast_points,
    )


def context_current_minutes(context: AgentContext) -> int:
    return hhmm_to_minutes(context.current_time_hhmm)

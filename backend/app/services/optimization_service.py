from typing import List

from ..models.device import DeviceItem
from ..models.optimization import (
    ForecastHourResult,
    ForecastPoint,
    MultiScenarioResponse,
    OptimizeRequest,
    OptimizeResponse,
    ScenarioResult,
    WeatherInfo,
)
from .recommendation_service import generate_alerts
from .weather_service import fetch_weather_and_forecast


def hhmm_to_minutes(hhmm: str) -> int:
    hours_str, minutes_str = hhmm.split(":")
    hours = int(hours_str)
    minutes = int(minutes_str)
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid HH:MM value: {hhmm}")
    return hours * 60 + minutes


def is_within_schedule(current_minutes: int, start_hhmm: str, end_hhmm: str) -> bool:
    start_minutes = hhmm_to_minutes(start_hhmm)
    end_minutes = hhmm_to_minutes(end_hhmm)
    if start_minutes <= end_minutes:
        return start_minutes <= current_minutes <= end_minutes
    return current_minutes >= start_minutes or current_minutes <= end_minutes


def build_mock_12h_forecast(start_hhmm: str) -> List[ForecastPoint]:
    start_minutes = hhmm_to_minutes(start_hhmm)
    energy_curve = [5, 4, 3, 2.5, 2, 1.5, 1, 0.5, 0.5, 1, 2, 3]

    forecast: List[ForecastPoint] = []
    for idx, energy in enumerate(energy_curve):
        hour_minutes = (start_minutes + idx * 60) % (24 * 60)
        hh = hour_minutes // 60
        mm = hour_minutes % 60
        forecast.append(ForecastPoint(hour=f"{hh:02d}:{mm:02d}", energy=energy))
    return forecast


def run_optimization_for_order(
    ordered_devices: List[DeviceItem],
    *,
    available_energy: float,
    current_minutes: int,
) -> OptimizeResponse:
    remaining_energy = available_energy
    can_run: List[DeviceItem] = []
    cannot_run = []

    for device in ordered_devices:
        if not is_within_schedule(current_minutes, device.start_time, device.end_time):
            cannot_run.append({"device": device, "reason": "outside schedule"})
            continue

        if device.power <= remaining_energy:
            can_run.append(device)
            remaining_energy -= device.power
        else:
            cannot_run.append({"device": device, "reason": "insufficient energy"})

    # Keep exact structure used by main.py previously via OptimizeResponse model
    return OptimizeResponse(can_run=can_run, cannot_run=cannot_run, remaining_energy=remaining_energy)


def optimize_devices(body: OptimizeRequest) -> MultiScenarioResponse:
    fallback_time = "12:00"
    try:
        weather_info, forecast_points = fetch_weather_and_forecast(body.city)
        available_energy = weather_info.energy_estimate
        current_time_hhmm = forecast_points[0].hour
    except Exception:
        weather_info = WeatherInfo(
            city=body.city,
            condition="Unavailable",
            energy_estimate=3.0,
            temperature=None,
        )
        available_energy = weather_info.energy_estimate
        current_time_hhmm = fallback_time
        forecast_points = build_mock_12h_forecast(current_time_hhmm)

    current_minutes = hhmm_to_minutes(current_time_hhmm)

    priority_first_devices = sorted(body.devices, key=lambda device: (not device.essential, -device.priority))
    energy_saving_devices = sorted(body.devices, key=lambda device: device.power)
    performance_devices = sorted(body.devices, key=lambda device: device.power, reverse=True)

    priority_first_result = run_optimization_for_order(
        priority_first_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    energy_saving_result = run_optimization_for_order(
        energy_saving_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    performance_result = run_optimization_for_order(
        performance_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )

    forecast_results: List[ForecastHourResult] = []
    for point in forecast_points:
        hour_minutes = hhmm_to_minutes(point.hour)
        hour_result = run_optimization_for_order(
            priority_first_devices,
            available_energy=point.energy,
            current_minutes=hour_minutes,
        )
        forecast_results.append(
            ForecastHourResult(hour=point.hour, can_run=hour_result.can_run, remaining_energy=hour_result.remaining_energy)
        )

    alerts = generate_alerts(baseline_result=priority_first_result, forecast_results=forecast_results)

    return MultiScenarioResponse(
        scenarios=[
            ScenarioResult(name="Priority First", **priority_first_result.model_dump()),
            ScenarioResult(name="Energy Saving", **energy_saving_result.model_dump()),
            ScenarioResult(name="Performance", **performance_result.model_dump()),
        ],
        forecast=forecast_results,
        alerts=alerts,
        weather=weather_info,
    )


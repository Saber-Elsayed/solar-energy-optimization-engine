from dataclasses import dataclass
from datetime import datetime
from typing import List

from ..models.device import DeviceItem
from ..models.optimization import (
    CannotRunItem,
    ForecastHourResult,
    ForecastPoint,
    MultiScenarioResponse,
    OptimizeRequest,
    OptimizeResponse,
    ScenarioResult,
    WeatherInfo,
)
from .energy_service import get_latest_energy
from .recommendation_service import generate_alerts
from .solar_system_service import get_solar_system
from .weather_service import fetch_weather_and_forecast

DEV_SOLAR_USER_ID = "dev-solar-user"
DEFAULT_BATTERY_CAPACITY_WH = 1500.0
DEFAULT_INVERTER_MAX_POWER_W = 2000.0
DEFAULT_SOC_PERCENT = 100.0
MAX_WEATHER_ENERGY_SCORE = 5.0

CONSTRAINT_SCHEDULE = "schedule"
CONSTRAINT_INVERTER_POWER = "inverter_power"
CONSTRAINT_AVAILABLE_ENERGY = "available_energy"


@dataclass(frozen=True)
class OptimizationConstraints:
    """Resolved physical limits used by the rule-based optimizer."""

    available_energy_wh: float
    inverter_max_power_w: float


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


def calculate_device_energy_wh(power_w: float, duration_minutes: int) -> float:
    duration_hours = duration_minutes / 60
    return power_w * duration_hours


def calculate_available_energy_wh(battery_capacity_wh: float, soc_percent: float) -> float:
    return battery_capacity_wh * (soc_percent / 100)


def weather_energy_to_wh(weather_energy: float, battery_capacity_wh: float) -> float:
    normalized = weather_energy / MAX_WEATHER_ENERGY_SCORE
    return normalized * battery_capacity_wh


def build_blocked_item(*, device: DeviceItem, blocked_reason: str, exceeded_constraint: str) -> CannotRunItem:
    return CannotRunItem(
        device=device,
        reason=blocked_reason,
        blocked_reason=blocked_reason,
        exceeded_constraint=exceeded_constraint,
    )


def resolve_battery_capacity_and_inverter() -> tuple[float, float]:
    try:
        profile = get_solar_system(user_id=DEV_SOLAR_USER_ID)
        if profile is not None:
            return profile.battery_capacity_wh, profile.inverter_max_power_w
    except Exception:
        pass
    return DEFAULT_BATTERY_CAPACITY_WH, DEFAULT_INVERTER_MAX_POWER_W


def resolve_soc_percent() -> float:
    try:
        latest = get_latest_energy()
        if latest is not None and latest.get("soc") is not None:
            return float(latest["soc"])
    except Exception:
        pass
    return DEFAULT_SOC_PERCENT


def build_current_constraints(*, battery_capacity_wh: float, soc_percent: float, inverter_max_power_w: float) -> OptimizationConstraints:
    return OptimizationConstraints(
        available_energy_wh=calculate_available_energy_wh(battery_capacity_wh, soc_percent),
        inverter_max_power_w=inverter_max_power_w,
    )


def build_forecast_constraints(
    *,
    weather_energy: float,
    battery_capacity_wh: float,
    inverter_max_power_w: float,
) -> OptimizationConstraints:
    return OptimizationConstraints(
        available_energy_wh=weather_energy_to_wh(weather_energy, battery_capacity_wh),
        inverter_max_power_w=inverter_max_power_w,
    )


def solar_energy_score_for_clock_hour(hhmm: str) -> float:
    """Approximate daylight score for mock forecasts; 0 during night hours."""
    hour_of_day = hhmm_to_minutes(hhmm) // 60
    if hour_of_day < 6 or hour_of_day >= 20:
        return 0.0
    daylight_factor = max(0.0, 1.0 - abs(hour_of_day - 13) / 7.0)
    return daylight_factor * 5.0


def build_mock_12h_forecast(start_hhmm: str) -> List[ForecastPoint]:
    start_minutes = hhmm_to_minutes(start_hhmm)

    forecast: List[ForecastPoint] = []
    for idx in range(12):
        hour_minutes = (start_minutes + idx * 60) % (24 * 60)
        hh = hour_minutes // 60
        mm = hour_minutes % 60
        hour = f"{hh:02d}:{mm:02d}"
        energy = solar_energy_score_for_clock_hour(hour)
        forecast.append(ForecastPoint(hour=hour, energy=energy, is_day=energy > 0))
    return forecast


def validate_schedule(*, device: DeviceItem, current_minutes: int) -> CannotRunItem | None:
    if is_within_schedule(current_minutes, device.start_time, device.end_time):
        return None
    return build_blocked_item(
        device=device,
        blocked_reason="Device is outside its allowed schedule window.",
        exceeded_constraint=CONSTRAINT_SCHEDULE,
    )


def validate_inverter_power(*, device: DeviceItem, active_power_w: float, inverter_max_power_w: float) -> CannotRunItem | None:
    projected_power_w = active_power_w + device.power
    if projected_power_w <= inverter_max_power_w:
        return None
    return build_blocked_item(
        device=device,
        blocked_reason=(
            f"Total active power ({projected_power_w:.0f} W) exceeds inverter limit "
            f"({inverter_max_power_w:.0f} W)."
        ),
        exceeded_constraint=CONSTRAINT_INVERTER_POWER,
    )


def validate_available_energy(
    *,
    device: DeviceItem,
    required_energy_wh: float,
    remaining_energy_wh: float,
) -> CannotRunItem | None:
    if required_energy_wh <= remaining_energy_wh:
        return None
    return build_blocked_item(
        device=device,
        blocked_reason=(
            f"Required energy ({required_energy_wh:.0f} Wh) exceeds remaining available energy "
            f"({remaining_energy_wh:.0f} Wh)."
        ),
        exceeded_constraint=CONSTRAINT_AVAILABLE_ENERGY,
    )


def run_optimization_for_order(
    ordered_devices: List[DeviceItem],
    *,
    constraints: OptimizationConstraints,
    current_minutes: int,
) -> OptimizeResponse:
    remaining_energy_wh = constraints.available_energy_wh
    active_power_w = 0.0
    can_run: List[DeviceItem] = []
    cannot_run: List[CannotRunItem] = []

    for device in ordered_devices:
        schedule_violation = validate_schedule(device=device, current_minutes=current_minutes)
        if schedule_violation is not None:
            cannot_run.append(schedule_violation)
            continue

        inverter_violation = validate_inverter_power(
            device=device,
            active_power_w=active_power_w,
            inverter_max_power_w=constraints.inverter_max_power_w,
        )
        if inverter_violation is not None:
            cannot_run.append(inverter_violation)
            continue

        device_energy_wh = calculate_device_energy_wh(device.power, device.duration)
        energy_violation = validate_available_energy(
            device=device,
            required_energy_wh=device_energy_wh,
            remaining_energy_wh=remaining_energy_wh,
        )
        if energy_violation is not None:
            cannot_run.append(energy_violation)
            continue

        can_run.append(device)
        remaining_energy_wh -= device_energy_wh
        active_power_w += device.power

    return OptimizeResponse(can_run=can_run, cannot_run=cannot_run, remaining_energy=remaining_energy_wh)


def optimize_devices(body: OptimizeRequest) -> MultiScenarioResponse:
    fallback_time = datetime.now().strftime("%H:%M")
    battery_capacity_wh, inverter_max_power_w = resolve_battery_capacity_and_inverter()
    soc_percent = resolve_soc_percent()
    current_constraints = build_current_constraints(
        battery_capacity_wh=battery_capacity_wh,
        soc_percent=soc_percent,
        inverter_max_power_w=inverter_max_power_w,
    )

    try:
        weather_info, forecast_points = fetch_weather_and_forecast(body.city)
        current_time_hhmm = forecast_points[0].hour
    except Exception:
        weather_info = WeatherInfo(
            city=body.city,
            condition="Unavailable",
            energy_estimate=3.0,
            temperature=None,
        )
        current_time_hhmm = fallback_time
        forecast_points = build_mock_12h_forecast(current_time_hhmm)

    current_minutes = hhmm_to_minutes(current_time_hhmm)

    priority_first_devices = sorted(body.devices, key=lambda device: (not device.essential, -device.priority))
    energy_saving_devices = sorted(body.devices, key=lambda device: device.power)
    performance_devices = sorted(body.devices, key=lambda device: device.power, reverse=True)

    priority_first_result = run_optimization_for_order(
        priority_first_devices,
        constraints=current_constraints,
        current_minutes=current_minutes,
    )
    energy_saving_result = run_optimization_for_order(
        energy_saving_devices,
        constraints=current_constraints,
        current_minutes=current_minutes,
    )
    performance_result = run_optimization_for_order(
        performance_devices,
        constraints=current_constraints,
        current_minutes=current_minutes,
    )

    forecast_results: List[ForecastHourResult] = []
    for point in forecast_points:
        hour_minutes = hhmm_to_minutes(point.hour)
        hour_constraints = build_forecast_constraints(
            weather_energy=point.energy,
            battery_capacity_wh=battery_capacity_wh,
            inverter_max_power_w=inverter_max_power_w,
        )
        hour_result = run_optimization_for_order(
            priority_first_devices,
            constraints=hour_constraints,
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
        forecast_points=forecast_points,
        alerts=alerts,
        weather=weather_info,
    )

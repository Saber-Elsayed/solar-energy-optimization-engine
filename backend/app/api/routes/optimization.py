from fastapi import APIRouter

from ...models.optimization import BestCombinationResponse, MultiScenarioResponse, OptimizeRequest
from ...services.optimization_service import (
    build_current_constraints,
    hhmm_to_minutes,
    optimize_devices,
    resolve_battery_capacity_and_inverter,
    resolve_soc_percent,
)
from ...services.or_tools_optimizer import run_or_tools_best_combination
from ...services.weather_service import fetch_weather_and_forecast

router = APIRouter()


@router.post("/optimize", response_model=MultiScenarioResponse)
def optimize(body: OptimizeRequest) -> MultiScenarioResponse:
    return optimize_devices(body)


@router.post("/optimize/best-combination", response_model=BestCombinationResponse)
def optimize_best_combination(body: OptimizeRequest) -> BestCombinationResponse:
    """Return the OR-Tools optimal device subset for current battery/inverter constraints."""
    battery_capacity_wh, inverter_max_power_w = resolve_battery_capacity_and_inverter()
    soc_percent = resolve_soc_percent()
    constraints = build_current_constraints(
        battery_capacity_wh=battery_capacity_wh,
        soc_percent=soc_percent,
        inverter_max_power_w=inverter_max_power_w,
    )

    fallback_time = "12:00"
    try:
        _, forecast_points = fetch_weather_and_forecast(body.city)
        current_time_hhmm = forecast_points[0].hour
    except Exception:
        current_time_hhmm = fallback_time

    current_minutes = hhmm_to_minutes(current_time_hhmm)
    return run_or_tools_best_combination(
        body.devices,
        constraints=constraints,
        current_minutes=current_minutes,
        apply_schedule=False,
    )

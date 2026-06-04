from datetime import datetime

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
from ...utils.log_context import current_optimization_snapshot
from ...utils.log_helpers import build_optimization_metadata, record_activity

router = APIRouter()


def _log_optimization_run(*, strategy: str, allowed: int, blocked: int, extra: dict | None = None) -> None:
    soc, available_energy_wh, inverter_limit_w, _capacity = current_optimization_snapshot()
    record_activity(
        "RUN_OPTIMIZATION",
        entity_type="optimization",
        metadata=build_optimization_metadata(
            strategy=strategy,
            soc=soc,
            available_energy_wh=available_energy_wh,
            inverter_limit_w=inverter_limit_w,
            allowed_devices_count=allowed,
            blocked_devices_count=blocked,
            extra=extra,
        ),
    )


@router.post("/optimize", response_model=MultiScenarioResponse)
def optimize(body: OptimizeRequest) -> MultiScenarioResponse:
    result = optimize_devices(body)
    priority = result.scenarios[0] if result.scenarios else None
    allowed = len(priority.can_run) if priority else 0
    blocked = len(priority.cannot_run) if priority else 0
    record_activity(
        "RUN_FORECAST",
        entity_type="forecast",
        metadata={
            "city": body.city,
            "forecast_hours": len(result.forecast_points),
            "device_count": len(body.devices),
        },
    )
    _log_optimization_run(
        strategy="priority_first",
        allowed=allowed,
        blocked=blocked,
        extra={"city": body.city, "solver": "rule_based"},
    )
    return result


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

    fallback_time = datetime.now().strftime("%H:%M")
    try:
        _, forecast_points = fetch_weather_and_forecast(body.city)
        current_time_hhmm = forecast_points[0].hour
    except Exception:
        current_time_hhmm = fallback_time

    current_minutes = hhmm_to_minutes(current_time_hhmm)
    response = run_or_tools_best_combination(
        body.devices,
        constraints=constraints,
        current_minutes=current_minutes,
        apply_schedule=False,
    )
    _log_optimization_run(
        strategy="or_tools",
        allowed=len(response.can_run),
        blocked=len(response.cannot_run),
        extra={
            "city": body.city,
            "solver_status": response.solver_status,
            "objective_score": response.objective_score,
            "total_power_w": response.total_power_w,
            "total_energy_wh": response.total_energy_wh,
        },
    )
    return response

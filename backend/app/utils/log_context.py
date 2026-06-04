"""Resolve optimization constraint snapshot for activity log metadata."""

from ..services.optimization_service import (
    build_current_constraints,
    resolve_battery_capacity_and_inverter,
    resolve_soc_percent,
)


def current_optimization_snapshot() -> tuple[float, float, float, float]:
    """Returns (soc, available_energy_wh, inverter_limit_w, battery_capacity_wh)."""
    battery_capacity_wh, inverter_max_power_w = resolve_battery_capacity_and_inverter()
    soc_percent = resolve_soc_percent()
    constraints = build_current_constraints(
        battery_capacity_wh=battery_capacity_wh,
        soc_percent=soc_percent,
        inverter_max_power_w=inverter_max_power_w,
    )
    return soc_percent, constraints.available_energy_wh, inverter_max_power_w, battery_capacity_wh

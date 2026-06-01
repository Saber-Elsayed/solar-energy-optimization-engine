"""CP-SAT subset selection: best device combination under inverter, energy, schedule, and essential/optional rules."""

from __future__ import annotations

from typing import List, Literal

from ..models.device import DeviceItem
from ..models.optimization import BestCombinationResponse, CannotRunItem
from .optimization_service import (
    CONSTRAINT_AVAILABLE_ENERGY,
    CONSTRAINT_INVERTER_POWER,
    OptimizationConstraints,
    build_blocked_item,
    calculate_device_energy_wh,
    is_within_schedule,
    validate_schedule,
)

SolverStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNAVAILABLE"]

# Weight essential devices heavily, then add priority (1–5).
ESSENTIAL_WEIGHT = 1000


def _device_objective_weight(device: DeviceItem) -> int:
    return (ESSENTIAL_WEIGHT if device.essential else 0) + device.priority


def run_or_tools_best_combination(
    devices: List[DeviceItem],
    *,
    constraints: OptimizationConstraints,
    current_minutes: int | None = None,
    apply_schedule: bool = False,
) -> BestCombinationResponse:
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return BestCombinationResponse(
            can_run=[],
            cannot_run=[],
            total_power_w=0.0,
            total_energy_wh=0.0,
            remaining_energy_wh=constraints.available_energy_wh,
            objective_score=0,
            solver_status="UNAVAILABLE",
        )

    if not devices:
        return BestCombinationResponse(
            can_run=[],
            cannot_run=[],
            total_power_w=0.0,
            total_energy_wh=0.0,
            remaining_energy_wh=constraints.available_energy_wh,
            objective_score=0,
            solver_status="INFEASIBLE",
        )

    model = cp_model.CpModel()
    n = len(devices)
    x = [model.new_bool_var(f"run_{i}") for i in range(n)]

    powers = [int(round(device.power)) for device in devices]
    energies = [int(round(calculate_device_energy_wh(device.power, device.duration))) for device in devices]
    inverter_cap = max(0, int(round(constraints.inverter_max_power_w)))
    energy_cap = max(0, int(round(constraints.available_energy_wh)))

    model.add(sum(powers[i] * x[i] for i in range(n)) <= inverter_cap)
    model.add(sum(energies[i] * x[i] for i in range(n)) <= energy_cap)

    optional_indices = [i for i, device in enumerate(devices) if not device.essential]
    essential_indices = [i for i, device in enumerate(devices) if device.essential]
    if optional_indices and essential_indices:
        model.add(
            sum(x[i] for i in optional_indices)
            <= len(optional_indices) * sum(x[i] for i in essential_indices)
        )

    if apply_schedule and current_minutes is not None:
        for i, device in enumerate(devices):
            if not is_within_schedule(current_minutes, device.start_time, device.end_time):
                model.add(x[i] == 0)

    weights = [_device_objective_weight(device) for device in devices]
    model.maximize(sum(weights[i] * x[i] for i in range(n)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        cannot_run = _build_cannot_run_for_all(
            devices,
            current_minutes=current_minutes,
            apply_schedule=apply_schedule,
        )
        return BestCombinationResponse(
            can_run=[],
            cannot_run=cannot_run,
            total_power_w=0.0,
            total_energy_wh=0.0,
            remaining_energy_wh=constraints.available_energy_wh,
            objective_score=0,
            solver_status="INFEASIBLE",
        )

    can_run: List[DeviceItem] = []
    cannot_run: List[CannotRunItem] = []
    total_power_w = 0.0
    total_energy_wh = 0.0
    objective_score = 0

    for i, device in enumerate(devices):
        if solver.Value(x[i]) == 1:
            can_run.append(device)
            total_power_w += device.power
            total_energy_wh += calculate_device_energy_wh(device.power, device.duration)
            objective_score += weights[i]
        else:
            cannot_run.append(_not_selected_item(device, current_minutes=current_minutes, apply_schedule=apply_schedule))

    remaining_energy_wh = max(0.0, constraints.available_energy_wh - total_energy_wh)
    solver_status: SolverStatus = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"

    return BestCombinationResponse(
        can_run=can_run,
        cannot_run=cannot_run,
        total_power_w=total_power_w,
        total_energy_wh=total_energy_wh,
        remaining_energy_wh=remaining_energy_wh,
        objective_score=objective_score,
        solver_status=solver_status,
    )


def _not_selected_item(
    device: DeviceItem,
    *,
    current_minutes: int | None,
    apply_schedule: bool,
) -> CannotRunItem:
    if apply_schedule and current_minutes is not None:
        schedule_violation = validate_schedule(device=device, current_minutes=current_minutes)
        if schedule_violation is not None:
            return schedule_violation
    return build_blocked_item(
        device=device,
        blocked_reason="Not selected in the OR-Tools optimal combination.",
        exceeded_constraint=CONSTRAINT_AVAILABLE_ENERGY,
    )


def _build_cannot_run_for_all(
    devices: List[DeviceItem],
    *,
    current_minutes: int | None,
    apply_schedule: bool,
) -> List[CannotRunItem]:
    blocked: List[CannotRunItem] = []
    for device in devices:
        if apply_schedule and current_minutes is not None:
            schedule_violation = validate_schedule(device=device, current_minutes=current_minutes)
            if schedule_violation is not None:
                blocked.append(schedule_violation)
                continue
        blocked.append(
            build_blocked_item(
                device=device,
                blocked_reason="No feasible combination satisfies inverter and energy constraints.",
                exceeded_constraint=CONSTRAINT_INVERTER_POWER,
            )
        )
    return blocked


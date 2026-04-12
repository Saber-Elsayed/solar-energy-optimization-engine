"""FastAPI application entrypoint.

This module creates the ASGI application object that Uvicorn runs
(e.g. `uvicorn app.main:app --reload`).
"""

from typing import List, Tuple

from fastapi import FastAPI
from pydantic import BaseModel, Field

# Instantiate the FastAPI application. This registers the app with Starlette/FastAPI
# and enables automatic OpenAPI schema generation at /docs and /redoc.
app = FastAPI(
    title="Solar Energy Optimization Engine",
    version="0.1.0",
)


# --- Request / response models (Pydantic) --------------------------------------
# FastAPI uses these for JSON body parsing, validation, and OpenAPI documentation.


class DeviceItem(BaseModel):
    """One controllable device in an optimization request."""

    name: str = Field(..., min_length=1, description="Human-readable device label.")
    power_kw: float = Field(..., gt=0, description="Nominal electrical power in kW.")
    duration_minutes: int = Field(..., gt=0, description="How long the device runs when scheduled.")
    # Priority is constrained to 1 (lowest) through 5 (highest) as specified by the API contract.
    priority: int = Field(..., ge=1, le=5, description="Scheduling priority from 1 (low) to 5 (high).")
    mandatory: bool = Field(..., description="If true, device must be satisfied when feasible.")


class OptimizeRequest(BaseModel):
    """Body for POST /optimize: a list of devices to consider."""

    devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices the optimizer should take into account (may be empty).",
    )


class ScenarioResult(BaseModel):
    """One named allocation outcome under the site power cap."""

    name: str = Field(..., description="Scenario label for clients and dashboards.")
    active_devices: List[DeviceItem] = Field(default_factory=list, description="Devices turned on under this scenario.")
    rejected_devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices not active here (over cap, or excluded by scenario rules).",
    )


class OptimizeResponse(BaseModel):
    """Payload returned after accepting a valid optimize request."""

    message: str
    count: int
    # Snapshot-style site telemetry (see /optimize handler for source of these values).
    solar_production_kw: float = Field(..., description="Instantaneous or interval solar output (kW).")
    battery_level_kwh: float = Field(..., description="Current battery state of charge (kWh).")
    max_power_kw: float = Field(..., description="Maximum site or inverter power capability (kW).")
    scenarios: List[ScenarioResult] = Field(
        default_factory=list,
        description="Multiple allocation strategies for the same request and site limits.",
    )


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}


def _greedy_allocate_by_priority(
    devices: List[DeviceItem],
    max_power_kw: float,
) -> Tuple[List[DeviceItem], List[DeviceItem]]:
    """Greedy allocation: higher numeric priority first, then pack until power cap.

    Returns (active_devices, rejected_devices) for the given *devices* list only.
    """
    # Step 1: Higher priority first (5 before 1 per DeviceItem schema).
    ordered = sorted(devices, key=lambda d: d.priority, reverse=True)
    # Step 2: Running sum of power for accepted devices.
    current_load = 0.0
    active: List[DeviceItem] = []
    rejected: List[DeviceItem] = []
    # Step 3: Accept while under cap; otherwise reject.
    for device in ordered:
        if current_load + device.power_kw <= max_power_kw:
            active.append(device)
            current_load += device.power_kw
        else:
            rejected.append(device)
    return active, rejected


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest) -> OptimizeResponse:
    """Accept a list of devices and allocate them under a simulated site power cap.

    Pydantic validates the JSON body before this function runs; invalid payloads
    receive 422 with error details from FastAPI.
    """
    # --- Simulated embedded / on-site data -----------------------------------------
    # In production these would come from hardware (inverter, BMS, energy meter) or
    # a telemetry service. Here we use fixed values to mimic what an embedded
    # controller or gateway would already know about the site at request time.
    solar_production_kw = 5.0
    battery_level_kwh = 10.0
    max_power_kw = 6.0

    # --- Scenario A: Max Usage — consider every device; pack as many as the greedy rule allows.
    active_a, rejected_a = _greedy_allocate_by_priority(body.devices, max_power_kw)
    scenario_max_usage = ScenarioResult(
        name="Max Usage",
        active_devices=active_a,
        rejected_devices=rejected_a,
    )

    # --- Scenario B: High Priority Only — only priority 1–2 may be active (per product rule).
    # Run the same greedy allocator on that subset. Devices with priority 3–5 are never
    # active here; they are listed in rejected_devices so the full input set is partitioned.
    eligible_low = [d for d in body.devices if d.priority in (1, 2)]
    active_b, rejected_eligible_b = _greedy_allocate_by_priority(eligible_low, max_power_kw)
    excluded_b = [d for d in body.devices if d.priority not in (1, 2)]
    scenario_high_priority_only = ScenarioResult(
        name="High Priority Only",
        active_devices=active_b,
        rejected_devices=rejected_eligible_b + excluded_b,
    )

    return OptimizeResponse(
        message="received devices",
        count=len(body.devices),
        solar_production_kw=solar_production_kw,
        battery_level_kwh=battery_level_kwh,
        max_power_kw=max_power_kw,
        scenarios=[scenario_max_usage, scenario_high_priority_only],
    )

"""FastAPI application entrypoint.

This module creates the ASGI application object that Uvicorn runs
(e.g. `uvicorn app.main:app --reload`).
"""

from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Instantiate the FastAPI application. This registers the app with Starlette/FastAPI
# and enables automatic OpenAPI schema generation at /docs and /redoc.
app = FastAPI(
    title="Solar Energy Optimization Engine",
    version="0.1.0",
)

# Expo Web (and other browsers) block cross-origin fetch unless the API sends CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / response models (Pydantic) --------------------------------------
# FastAPI uses these for JSON body parsing, validation, and OpenAPI documentation.


class DeviceItem(BaseModel):
    """A device candidate for this optimization cycle."""

    name: str = Field(..., min_length=1, description="Human-readable device label.")
    power: float = Field(..., gt=0, description="Energy demand placeholder used by this mock optimizer.")
    duration: int = Field(..., gt=0, description="Intended runtime in minutes.")
    priority: int = Field(..., ge=1, le=5, description="Priority from 1 (low) to 5 (high).")
    essential: bool = Field(..., description="Essential devices are scheduled before non-essential devices.")
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule start time in HH:MM.")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule end time in HH:MM.")


class OptimizeRequest(BaseModel):
    """Body for POST /optimize: a list of devices to consider."""

    devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices the optimizer should take into account (may be empty).",
    )


class CannotRunItem(BaseModel):
    """A rejected device with an explanation."""

    device: DeviceItem
    reason: str = Field(..., description="Reason the device cannot run right now.")


class OptimizeResponse(BaseModel):
    """One optimization scenario result based on the current constraints."""

    can_run: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices that fit inside the currently remaining energy budget.",
    )
    cannot_run: List[CannotRunItem] = Field(
        default_factory=list,
        description="Devices that cannot be scheduled, including the reason.",
    )
    remaining_energy: float = Field(..., ge=0, description="Energy left after scheduling.")


class ScenarioResult(BaseModel):
    """A named strategy and its optimization output."""

    name: str
    can_run: List[DeviceItem] = Field(default_factory=list)
    cannot_run: List[CannotRunItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0)


class MultiScenarioResponse(BaseModel):
    """Response wrapper that returns multiple optimization strategies."""

    scenarios: List[ScenarioResult] = Field(default_factory=list)


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}


def _hhmm_to_minutes(hhmm: str) -> int:
    """Convert HH:MM to minutes from midnight."""
    hours_str, minutes_str = hhmm.split(":")
    hours = int(hours_str)
    minutes = int(minutes_str)
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid HH:MM value: {hhmm}")
    return hours * 60 + minutes


def _is_within_schedule(current_minutes: int, start_hhmm: str, end_hhmm: str) -> bool:
    """Return True when current time is inside [start, end], supporting overnight windows.

    Example overnight window:
    - start=22:00, end=06:00 is valid for times late night or early morning.
    """
    start_minutes = _hhmm_to_minutes(start_hhmm)
    end_minutes = _hhmm_to_minutes(end_hhmm)

    if start_minutes <= end_minutes:
        return start_minutes <= current_minutes <= end_minutes
    # Overnight schedule (crosses midnight): valid if after start OR before end.
    return current_minutes >= start_minutes or current_minutes <= end_minutes


def _run_optimization_for_order(
    ordered_devices: List[DeviceItem],
    *,
    available_energy: float,
    current_minutes: int,
) -> OptimizeResponse:
    """Run reusable schedule + energy checks for a pre-sorted device list."""
    remaining_energy = available_energy
    can_run: List[DeviceItem] = []
    cannot_run: List[CannotRunItem] = []

    # Reusable greedy allocator:
    # - Check schedule first.
    # - If inside schedule, allocate if enough energy remains.
    for device in ordered_devices:
        if not _is_within_schedule(current_minutes, device.start_time, device.end_time):
            cannot_run.append(CannotRunItem(device=device, reason="outside schedule"))
            continue

        if device.power <= remaining_energy:
            can_run.append(device)
            remaining_energy -= device.power
        else:
            cannot_run.append(CannotRunItem(device=device, reason="insufficient energy"))

    return OptimizeResponse(
        can_run=can_run,
        cannot_run=cannot_run,
        remaining_energy=remaining_energy,
    )


@app.post("/optimize", response_model=MultiScenarioResponse)
def optimize(body: OptimizeRequest) -> MultiScenarioResponse:
    """Return multiple optimization scenarios using different ordering strategies.

    Pydantic validates the JSON body before this function runs; invalid payloads
    receive 422 with error details from FastAPI.
    """
    # Mock available energy for now (kWh). In production this comes from telemetry/battery state.
    available_energy = 5.0
    # Mock current time (HH:MM). Replace with real clock/telemetry in production.
    current_time_hhmm = "12:00"
    current_minutes = _hhmm_to_minutes(current_time_hhmm)

    # Scenario 1 - Priority First:
    # Essential devices first, then higher priority first.
    priority_first_devices = sorted(
        body.devices,
        key=lambda device: (not device.essential, -device.priority),
    )

    # Scenario 2 - Energy Saving:
    # Lowest-power devices first to maximize the count of runnable devices.
    energy_saving_devices = sorted(body.devices, key=lambda device: device.power)

    # Scenario 3 - Performance:
    # Highest-power devices first to prioritize heavy-load performance needs.
    performance_devices = sorted(body.devices, key=lambda device: device.power, reverse=True)

    priority_first_result = _run_optimization_for_order(
        priority_first_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    energy_saving_result = _run_optimization_for_order(
        energy_saving_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    performance_result = _run_optimization_for_order(
        performance_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )

    return MultiScenarioResponse(
        scenarios=[
            ScenarioResult(name="Priority First", **priority_first_result.model_dump()),
            ScenarioResult(name="Energy Saving", **energy_saving_result.model_dump()),
            ScenarioResult(name="Performance", **performance_result.model_dump()),
        ]
    )

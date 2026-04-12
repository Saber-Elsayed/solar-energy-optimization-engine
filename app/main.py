"""FastAPI application entrypoint.

This module creates the ASGI application object that Uvicorn runs
(e.g. `uvicorn app.main:app --reload`).
"""

from typing import List

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


class OptimizeResponse(BaseModel):
    """Payload returned after accepting a valid optimize request."""

    message: str
    count: int
    # Snapshot-style site telemetry (see /optimize handler for source of these values).
    solar_production_kw: float = Field(..., description="Instantaneous or interval solar output (kW).")
    battery_level_kwh: float = Field(..., description="Current battery state of charge (kWh).")
    max_power_kw: float = Field(..., description="Maximum site or inverter power capability (kW).")


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest) -> OptimizeResponse:
    """Accept a list of devices for optimization (validation only for now).

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

    # Echo how many devices were received; core optimization logic can be wired here later.
    return OptimizeResponse(
        message="received devices",
        count=len(body.devices),
        solar_production_kw=solar_production_kw,
        battery_level_kwh=battery_level_kwh,
        max_power_kw=max_power_kw,
    )

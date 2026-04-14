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


class OptimizeRequest(BaseModel):
    """Body for POST /optimize: a list of devices to consider."""

    devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices the optimizer should take into account (may be empty).",
    )


class OptimizeResponse(BaseModel):
    """Optimization result based on currently available mock energy."""

    can_run: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices that fit inside the currently remaining energy budget.",
    )
    cannot_run: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices that cannot be scheduled due to insufficient remaining energy.",
    )
    remaining_energy: float = Field(..., ge=0, description="Energy left after scheduling.")


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest) -> OptimizeResponse:
    """Allocate devices against a fixed mock energy budget.

    Pydantic validates the JSON body before this function runs; invalid payloads
    receive 422 with error details from FastAPI.
    """
    # Mock available energy for now (kWh). In production this comes from telemetry/battery state.
    available_energy = 5.0
    remaining_energy = available_energy

    # Sort rule:
    # 1) Essential devices first.
    # 2) Within each essential group, higher priority first (5 -> 1).
    ordered_devices = sorted(
        body.devices,
        key=lambda device: (not device.essential, -device.priority),
    )

    can_run: List[DeviceItem] = []
    cannot_run: List[DeviceItem] = []

    # Greedy allocation:
    # - If a device fits in remaining energy, schedule it and reduce remaining_energy.
    # - Otherwise mark it as cannot_run.
    for device in ordered_devices:
        if device.power <= remaining_energy:
            can_run.append(device)
            remaining_energy -= device.power
        else:
            cannot_run.append(device)

    return OptimizeResponse(
        can_run=can_run,
        cannot_run=cannot_run,
        remaining_energy=remaining_energy,
    )

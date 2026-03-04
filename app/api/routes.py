"""HTTP routes for the Solar Energy Optimization Engine.

Responsibility:
- Expose a thin HTTP API that delegates to core use-cases (e.g., optimization).
- Keep request parsing/validation at the boundary.
- Avoid embedding business logic here; the core layer owns domain decisions.
"""

from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.models.battery import Battery
from core.models.device import Device
from core.models.energy import TimeSeries
from core.models.pricing import Pricing
from core.optimization.optimizer import OptimizationResult, Optimizer

router = APIRouter(prefix="/api", tags=["optimization"])


class OptimizeRequest(BaseModel):
    """API boundary model for an optimization request."""

    production_forecast: TimeSeries = Field(
        ..., description="Forecasted solar production time series (e.g., kW)."
    )
    pricing: Pricing
    battery: Battery
    devices: List[Device] = Field(default_factory=list)


@router.post("/optimize", response_model=OptimizationResult)
def optimize(req: OptimizeRequest) -> OptimizationResult:
    """Compute an optimized plan given forecast, pricing, devices, and battery state."""
    optimizer = Optimizer()
    return optimizer.optimize(
        production_forecast=req.production_forecast,
        pricing=req.pricing,
        battery=req.battery,
        devices=req.devices,
    )


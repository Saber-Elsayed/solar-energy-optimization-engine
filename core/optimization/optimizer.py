"""Solar/battery/device optimization use-case.

Responsibility:
- Provide a core entrypoint to compute an operational plan (dispatch/scheduling)
  from forecasts, pricing, and constraints.

Clean Architecture note:
- This module must remain independent of FastAPI and any transport concerns.
"""

from typing import List, Optional

from pydantic import BaseModel, Field

from core.models.battery import Battery
from core.models.device import Device
from core.models.energy import TimeSeries
from core.models.pricing import Pricing


class OptimizationDecision(BaseModel):
    """A single decision/action within an optimized plan (placeholder)."""

    kind: str = Field(..., description="Decision type (e.g., charge, discharge, run_device).")
    description: Optional[str] = None


class OptimizationResult(BaseModel):
    """Result returned by the optimizer (placeholder)."""

    decisions: List[OptimizationDecision] = Field(default_factory=list)
    objective_value: Optional[float] = Field(
        default=None, description="Total cost/savings metric (if computed)."
    )


class Optimizer:
    """Core optimizer facade (skeleton).

    In a full implementation, this would coordinate forecasting outputs,
    constraint modeling, solver invocation, and post-processing.
    """

    def optimize(
        self,
        *,
        production_forecast: TimeSeries,
        pricing: Pricing,
        battery: Battery,
        devices: List[Device],
    ) -> OptimizationResult:
        """Compute an optimized plan.

        Args:
            production_forecast: Forecasted solar generation.
            pricing: Import/export prices.
            battery: Battery state and constraints.
            devices: Controllable loads.
        """
        # Skeleton only: return an empty plan.
        return OptimizationResult(decisions=[])


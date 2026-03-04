"""Battery domain models.

Responsibility:
- Represent battery state and constraints used by optimization and simulation.
- Keep battery concepts independent from any specific vendor or protocol.
"""

from pydantic import BaseModel, Field


class Battery(BaseModel):
    """Battery state and operational constraints (simplified)."""

    capacity_kwh: float = Field(..., gt=0)
    soc_kwh: float = Field(..., ge=0, description="State-of-charge in kWh.")
    max_charge_kw: float = Field(..., gt=0)
    max_discharge_kw: float = Field(..., gt=0)
    roundtrip_efficiency: float = Field(0.92, ge=0, le=1)


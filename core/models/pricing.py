"""Pricing/tariff domain models.

Responsibility:
- Represent time-varying electricity prices (import/export) used by optimization.
"""

from typing import Optional

from pydantic import BaseModel, Field

from core.models.energy import TimeSeries


class Pricing(BaseModel):
    """Time-varying price signals (simplified)."""

    currency: str = Field("USD", min_length=1)
    import_price: TimeSeries = Field(..., description="Grid import price series.")
    export_price: Optional[TimeSeries] = Field(
        default=None, description="Optional feed-in tariff/export price series."
    )


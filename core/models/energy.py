"""Energy-related domain models.

Responsibility:
- Represent time series inputs/outputs used across forecasting and optimization.
- Keep the model lightweight and agnostic to storage/transport concerns.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TimePoint(BaseModel):
    """A single timestamped measurement (e.g., kW at a given time)."""

    timestamp: datetime
    value: float = Field(..., description="Measurement value (unit defined by context).")


class TimeSeries(BaseModel):
    """A sequence of timestamped measurements."""

    unit: Optional[str] = Field(default=None, description="Unit label (e.g., kW, kWh).")
    points: List[TimePoint] = Field(default_factory=list)


"""Synthetic data generation for simulation.

Responsibility:
- Provide utilities to create mock solar production, pricing, and device inputs.
- Intended for experimentation; not part of core decision-making logic.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from core.models.energy import TimePoint, TimeSeries


class DataGenerator:
    """Generate simple synthetic time series data (skeleton)."""

    def generate_flat_series(
        self,
        *,
        start: datetime,
        intervals: int,
        step_minutes: int,
        value: float,
        unit: Optional[str] = None,
    ) -> TimeSeries:
        """Generate a flat time series with constant values."""
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)

        points: List[TimePoint] = []
        t = start
        for _ in range(intervals):
            points.append(TimePoint(timestamp=t, value=value))
            t = t + timedelta(minutes=step_minutes)

        return TimeSeries(unit=unit, points=points)


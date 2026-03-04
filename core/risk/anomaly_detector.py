"""Anomaly detection for time-series inputs.

Responsibility:
- Provide core detection hooks to flag suspicious production/consumption signals.
- Keep detection logic independent from storage, UI, and HTTP concerns.
"""

from typing import List

from pydantic import BaseModel, Field

from core.models.energy import TimeSeries


class Anomaly(BaseModel):
    """A detected anomaly (placeholder)."""

    message: str
    severity: str = Field("low", description="e.g., low/medium/high")


class AnomalyDetector:
    """Anomaly detector (skeleton)."""

    def detect(self, series: TimeSeries) -> List[Anomaly]:
        """Detect anomalies in a time series."""
        # Skeleton only: no anomalies.
        return []


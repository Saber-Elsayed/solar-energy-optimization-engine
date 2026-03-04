"""Solar production forecasting.

Responsibility:
- Define a core forecaster abstraction that can turn historical and/or weather
  inputs into a production forecast time series for downstream optimization.
"""

from typing import Optional

from pydantic import BaseModel, Field

from core.models.energy import TimeSeries


class ProductionForecastInput(BaseModel):
    """Inputs required to forecast production (placeholder)."""

    historical_production: Optional[TimeSeries] = None
    notes: Optional[str] = Field(default=None, description="Free-form context for experiments.")


class ProductionForecaster:
    """Production forecaster (skeleton)."""

    def forecast(self, data: ProductionForecastInput) -> TimeSeries:
        """Produce a forecasted solar production time series."""
        # Skeleton only: return an empty series.
        return TimeSeries(unit="kW", points=[])


from typing import List

from ..models.device import DeviceItem
from ..models.optimization import ForecastHourResult, OptimizeResponse


def generate_alerts(*, baseline_result: OptimizeResponse, forecast_results: List[ForecastHourResult]) -> List[str]:
    """Generate simple user-facing alerts from optimization + forecast outputs."""
    alerts: List[str] = []
    seen: set[str] = set()

    def add_alert(message: str) -> None:
        if message not in seen:
            seen.add(message)
            alerts.append(message)

    if baseline_result.remaining_energy <= 1.0:
        add_alert("Low energy - consider reducing usage")

    rejected_devices: List[DeviceItem] = [item.device for item in baseline_result.cannot_run]
    if any(device.essential for device in rejected_devices):
        add_alert("Essential device cannot run")

    high_power_threshold = 3.0
    if any(device.power >= high_power_threshold for device in rejected_devices):
        add_alert("Consider delaying high consumption device")

    for rejected in rejected_devices:
        suggested_hour = next(
            (
                hour_result.hour
                for hour_result in forecast_results
                if any(runnable.name == rejected.name for runnable in hour_result.can_run)
            ),
            None,
        )
        if suggested_hour:
            add_alert(f"You can run {rejected.name} at {suggested_hour}")

    return alerts


from pydantic import BaseModel


class CitySuggestion(BaseModel):
    """Autocomplete city item returned by /cities."""

    name: str
    country: str


class NightWindowResponse(BaseModel):
    """Darkness window from weather sunset until the following sunrise (discharge-only planning)."""

    city: str
    sunset: str
    sunrise: str
    darkness_minutes: int
    is_currently_dark: bool
    discharge_only: bool = True
    guidance: str


class DayWindowResponse(BaseModel):
    """Daylight window from sunrise until sunset (solar charging + 12h planning)."""

    city: str
    sunrise: str
    sunset: str
    daylight_minutes: int
    planning_horizon_minutes: int = 12 * 60
    is_currently_daylight: bool
    solar_charging_expected: bool = True
    guidance: str


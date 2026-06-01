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


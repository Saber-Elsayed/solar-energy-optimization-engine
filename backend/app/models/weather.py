from pydantic import BaseModel


class CitySuggestion(BaseModel):
    """Autocomplete city item returned by /cities."""

    name: str
    country: str


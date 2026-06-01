from typing import List

from fastapi import APIRouter

from ...models.weather import CitySuggestion, NightWindowResponse
from ...services.weather_service import fetch_night_window, search_cities

router = APIRouter()


@router.get("/cities", response_model=List[CitySuggestion])
def cities(query: str) -> List[CitySuggestion]:
    return search_cities(query)


@router.get("/weather/night-window", response_model=NightWindowResponse)
def night_window(city: str) -> NightWindowResponse:
    """Sunset→sunrise window for night discharge planning (from Open-Meteo)."""
    city_text = city.strip() or "Tel Aviv"
    return fetch_night_window(city_text)


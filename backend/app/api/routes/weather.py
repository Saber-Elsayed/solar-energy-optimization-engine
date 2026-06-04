from typing import List

from fastapi import APIRouter

from ...models.weather import CitySuggestion, DayWindowResponse, NightWindowResponse
from ...services.weather_service import fetch_day_window, fetch_night_window, search_cities

router = APIRouter()


@router.get("/cities", response_model=List[CitySuggestion])
def cities(query: str) -> List[CitySuggestion]:
    return search_cities(query)


@router.get("/weather/night-window", response_model=NightWindowResponse)
def night_window(city: str) -> NightWindowResponse:
    """Sunset→sunrise window for night discharge planning (from Open-Meteo)."""
    city_text = city.strip() or "Tel Aviv"
    return fetch_night_window(city_text)


@router.get("/weather/day-window", response_model=DayWindowResponse)
def day_window(city: str) -> DayWindowResponse:
    """Sunrise→sunset window for daytime planning with solar charging (from Open-Meteo)."""
    city_text = city.strip() or "Tel Aviv"
    return fetch_day_window(city_text)


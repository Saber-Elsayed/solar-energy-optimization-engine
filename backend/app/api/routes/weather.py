from typing import List

from fastapi import APIRouter

from ...models.weather import CitySuggestion
from ...services.weather_service import search_cities

router = APIRouter()


@router.get("/cities", response_model=List[CitySuggestion])
def cities(query: str) -> List[CitySuggestion]:
    return search_cities(query)


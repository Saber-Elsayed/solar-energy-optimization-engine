import json
from typing import List
from urllib.parse import quote
from urllib.request import urlopen

from ..models.optimization import ForecastPoint, WeatherInfo
from ..models.weather import CitySuggestion


def search_cities(query: str) -> List[CitySuggestion]:
    """Return city autocomplete suggestions for the given query (Open-Meteo)."""
    query_text = query.strip()
    if len(query_text) < 2:
        return []

    limit = 8
    geocode_url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={quote(query_text)}&count={limit}&language=en&format=json"
    )

    try:
        with urlopen(geocode_url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return []

    results = payload.get("results") or []
    suggestions: List[CitySuggestion] = []
    for item in results[:limit]:
        name = item.get("name")
        country_code = item.get("country_code") or item.get("country")
        if not name or not country_code:
            continue
        suggestions.append(CitySuggestion(name=name, country=country_code))
    return suggestions


def cloud_to_energy(cloud_cover: float) -> float:
    if cloud_cover <= 20:
        return 5.0
    if cloud_cover <= 60:
        return 3.0
    return 1.0


def cloud_to_condition(cloud_cover: float) -> str:
    if cloud_cover <= 20:
        return "Clear"
    if cloud_cover <= 60:
        return "Partly Cloudy"
    return "Cloudy"


def fetch_weather_and_forecast(city: str) -> tuple[WeatherInfo, List[ForecastPoint]]:
    """Fetch city weather (Open-Meteo) and convert to energy forecast."""
    geocode_url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={quote(city)}&count=1&language=en&format=json"
    )
    with urlopen(geocode_url, timeout=10) as response:
        geo_payload = json.loads(response.read().decode("utf-8"))
    results = geo_payload.get("results") or []
    if not results:
        raise ValueError(f"City not found: {city}")

    first = results[0]
    latitude = first["latitude"]
    longitude = first["longitude"]
    resolved_city = first.get("name", city)

    forecast_url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}"
        "&current=cloud_cover,temperature_2m"
        "&hourly=cloud_cover"
        "&forecast_days=1"
        "&timezone=auto"
    )
    with urlopen(forecast_url, timeout=10) as response:
        weather_payload = json.loads(response.read().decode("utf-8"))

    current = weather_payload.get("current", {})
    current_cloud_cover = float(current.get("cloud_cover", 50))
    temperature = current.get("temperature_2m")
    condition = cloud_to_condition(current_cloud_cover)
    energy_estimate = cloud_to_energy(current_cloud_cover)

    hourly = weather_payload.get("hourly", {})
    hourly_times = hourly.get("time", [])
    hourly_clouds = hourly.get("cloud_cover", [])
    if not hourly_times or not hourly_clouds:
        raise ValueError("Weather API returned no hourly cloud cover.")

    forecast_points: List[ForecastPoint] = []
    for idx, (time_iso, cloud) in enumerate(zip(hourly_times, hourly_clouds)):
        if idx >= 12:
            break
        hour = str(time_iso)[11:16]
        forecast_points.append(ForecastPoint(hour=hour, energy=cloud_to_energy(float(cloud))))

    if not forecast_points:
        raise ValueError("No forecast points generated from weather data.")

    weather_info = WeatherInfo(
        city=resolved_city,
        condition=condition,
        energy_estimate=energy_estimate,
        temperature=float(temperature) if temperature is not None else None,
    )
    return weather_info, forecast_points


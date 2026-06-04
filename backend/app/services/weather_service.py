import json
import logging
from datetime import datetime
from typing import List, Tuple
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import urlopen

logger = logging.getLogger(__name__)

from ..models.optimization import ForecastPoint, WeatherInfo
from ..models.weather import CitySuggestion, DayWindowResponse, NightWindowResponse

PLANNING_HORIZON_HOURS = 12


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


def _parse_weather_datetime(value: str) -> datetime:
    """Parse Open-Meteo ISO timestamps; normalize to naive local time for comparisons."""
    dt = datetime.fromisoformat(str(value))
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _format_hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _daylight_window_from_daily(
    *,
    sunsets: List[str],
    sunrises: List[str],
    now: datetime,
) -> Tuple[datetime, datetime, bool]:
    """Return (sunrise, sunset, is_currently_daylight) for today or the next daylight period."""
    for index in range(min(len(sunrises), len(sunsets))):
        sunrise_dt = _parse_weather_datetime(sunrises[index])
        sunset_dt = _parse_weather_datetime(sunsets[index])
        if sunrise_dt <= now < sunset_dt:
            return sunrise_dt, sunset_dt, True

    for index in range(min(len(sunrises), len(sunsets))):
        sunrise_dt = _parse_weather_datetime(sunrises[index])
        if now < sunrise_dt:
            sunset_dt = _parse_weather_datetime(sunsets[index])
            return sunrise_dt, sunset_dt, False

    sunrise_dt = _parse_weather_datetime(sunrises[-1])
    sunset_dt = _parse_weather_datetime(sunsets[-1])
    return sunrise_dt, sunset_dt, now >= sunrise_dt and now < sunset_dt


def _night_window_from_daily(
    *,
    sunsets: List[str],
    sunrises: List[str],
    now: datetime,
) -> Tuple[datetime, datetime, bool]:
    """Return (sunset, next_sunrise, is_currently_dark) for the active or upcoming night."""
    if len(sunsets) < 2 or len(sunrises) < 2:
        raise ValueError("Weather API returned insufficient daily sun times.")

    for index in range(len(sunsets) - 1):
        sunset_dt = _parse_weather_datetime(sunsets[index])
        sunrise_dt = _parse_weather_datetime(sunrises[index + 1])
        if sunset_dt <= now < sunrise_dt:
            return sunset_dt, sunrise_dt, True

    for index in range(len(sunsets)):
        sunset_dt = _parse_weather_datetime(sunsets[index])
        if now < sunset_dt:
            sunrise_dt = _parse_weather_datetime(sunrises[index + 1])
            return sunset_dt, sunrise_dt, False

    sunset_dt = _parse_weather_datetime(sunsets[-2])
    sunrise_dt = _parse_weather_datetime(sunrises[-1])
    return sunset_dt, sunrise_dt, now >= sunset_dt


def _night_window_fallback(city: str) -> NightWindowResponse:
    """Approximate night window when sunrise/sunset API data is unavailable."""
    return NightWindowResponse(
        city=city,
        sunset="18:00",
        sunrise="06:00",
        darkness_minutes=12 * 60,
        is_currently_dark=False,
        discharge_only=True,
        guidance=(
            "Weather sun times are temporarily unavailable; using a 12-hour night estimate. "
            "Discharge only — no solar charging until morning."
        ),
    )


def _fetch_night_window_open_meteo(city: str) -> NightWindowResponse:
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
        "&current=is_day,cloud_cover"
        "&daily=sunrise,sunset"
        "&forecast_days=3"
        "&timezone=auto"
    )
    with urlopen(forecast_url, timeout=10) as response:
        weather_payload = json.loads(response.read().decode("utf-8"))

    current = weather_payload.get("current", {})
    current_time_iso = current.get("time")
    now = _parse_weather_datetime(current_time_iso) if current_time_iso else datetime.now()

    daily = weather_payload.get("daily", {})
    sunsets = daily.get("sunset") or []
    sunrises = daily.get("sunrise") or []
    if not sunsets or not sunrises:
        raise ValueError("Weather API returned no sunrise/sunset data.")

    sunset_dt, sunrise_dt, is_currently_dark = _night_window_from_daily(
        sunsets=sunsets,
        sunrises=sunrises,
        now=now,
    )
    darkness_minutes = max(0, int(round((sunrise_dt - sunset_dt).total_seconds() / 60)))

    if is_currently_dark:
        guidance = (
            "Night mode: no solar charging until sunrise. Plan devices to run through darkness "
            "using battery discharge only."
        )
    else:
        guidance = (
            "Upcoming night: no charging is expected after sunset until sunrise. "
            "Select devices that can run for the full darkness period on battery alone."
        )

    return NightWindowResponse(
        city=resolved_city,
        sunset=_format_hhmm(sunset_dt),
        sunrise=_format_hhmm(sunrise_dt),
        darkness_minutes=darkness_minutes,
        is_currently_dark=is_currently_dark,
        discharge_only=True,
        guidance=guidance,
    )


def _day_window_fallback(city: str) -> DayWindowResponse:
    return DayWindowResponse(
        city=city,
        sunrise="06:00",
        sunset="18:00",
        daylight_minutes=12 * 60,
        planning_horizon_minutes=12 * 60,
        is_currently_daylight=True,
        solar_charging_expected=True,
        guidance=(
            "Weather sun times are temporarily unavailable; using a 12-hour daylight estimate. "
            "Battery can recharge from solar during this window."
        ),
    )


def _fetch_day_window_open_meteo(city: str) -> DayWindowResponse:
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
        "&current=is_day"
        "&daily=sunrise,sunset"
        "&forecast_days=3"
        "&timezone=auto"
    )
    with urlopen(forecast_url, timeout=10) as response:
        weather_payload = json.loads(response.read().decode("utf-8"))

    current = weather_payload.get("current", {})
    current_time_iso = current.get("time")
    now = _parse_weather_datetime(current_time_iso) if current_time_iso else datetime.now()

    daily = weather_payload.get("daily", {})
    sunsets = daily.get("sunset") or []
    sunrises = daily.get("sunrise") or []
    if not sunsets or not sunrises:
        raise ValueError("Weather API returned no sunrise/sunset data.")

    sunrise_dt, sunset_dt, is_currently_daylight = _daylight_window_from_daily(
        sunsets=sunsets,
        sunrises=sunrises,
        now=now,
    )
    daylight_minutes = max(0, int(round((sunset_dt - sunrise_dt).total_seconds() / 60)))
    planning_horizon_minutes = min(PLANNING_HORIZON_HOURS * 60, daylight_minutes or 12 * 60)

    if is_currently_daylight:
        guidance = (
            "Day plan: solar charging is expected until sunset. Add devices that stay within inverter "
            "power and can run through the 12-hour outlook with battery + solar."
        )
    else:
        guidance = (
            "Upcoming daylight: plan always-on loads (fridge, freezer) plus daytime appliances. "
            "Energy is not fixed — the battery recharges from solar during the day."
        )

    return DayWindowResponse(
        city=resolved_city,
        sunrise=_format_hhmm(sunrise_dt),
        sunset=_format_hhmm(sunset_dt),
        daylight_minutes=daylight_minutes,
        planning_horizon_minutes=planning_horizon_minutes,
        is_currently_daylight=is_currently_daylight,
        solar_charging_expected=True,
        guidance=guidance,
    )


def fetch_day_window(city: str) -> DayWindowResponse:
    """Resolve sunrise→sunset daylight for day planning (solar charging)."""
    try:
        return _fetch_day_window_open_meteo(city)
    except (ValueError, URLError, OSError, json.JSONDecodeError) as exc:
        logger.warning("Day window fetch failed for %s: %s", city, exc)
        return _day_window_fallback(city)
    except Exception as exc:
        logger.exception("Unexpected day window error for %s", city)
        return _day_window_fallback(city)


def fetch_night_window(city: str) -> NightWindowResponse:
    """Resolve sunset→sunrise darkness for discharge-only night planning."""
    try:
        return _fetch_night_window_open_meteo(city)
    except (ValueError, URLError, OSError, json.JSONDecodeError) as exc:
        logger.warning("Night window fetch failed for %s: %s", city, exc)
        return _night_window_fallback(city)
    except Exception as exc:
        logger.exception("Unexpected night window error for %s", city)
        return _night_window_fallback(city)


def _find_hourly_start_index(hourly_times: List[str], current_time_iso: str | None) -> int:
    if not hourly_times:
        return 0
    if not current_time_iso:
        return 0
    current_time_text = str(current_time_iso)
    for idx, time_iso in enumerate(hourly_times):
        if str(time_iso) >= current_time_text:
            return idx
    return max(0, len(hourly_times) - 1)


def fetch_weather_and_forecast(city: str) -> tuple[WeatherInfo, List[ForecastPoint]]:
    """Fetch city weather and build a 12-hour forward forecast from the current hour."""
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
        "&current=cloud_cover,temperature_2m,is_day"
        "&hourly=cloud_cover,is_day"
        "&forecast_days=2"
        "&timezone=auto"
    )
    with urlopen(forecast_url, timeout=10) as response:
        weather_payload = json.loads(response.read().decode("utf-8"))

    current = weather_payload.get("current", {})
    current_cloud_cover = float(current.get("cloud_cover", 50))
    temperature = current.get("temperature_2m")
    condition = cloud_to_condition(current_cloud_cover)
    energy_estimate = cloud_to_energy(current_cloud_cover)
    current_time_iso = current.get("time")

    hourly = weather_payload.get("hourly", {})
    hourly_times = hourly.get("time", [])
    hourly_clouds = hourly.get("cloud_cover", [])
    hourly_is_day = hourly.get("is_day", [])
    if not hourly_times or not hourly_clouds:
        raise ValueError("Weather API returned no hourly cloud cover.")

    start_idx = _find_hourly_start_index(hourly_times, current_time_iso)

    forecast_points: List[ForecastPoint] = []
    for offset in range(PLANNING_HORIZON_HOURS):
        idx = start_idx + offset
        if idx >= len(hourly_times):
            break
        time_iso = hourly_times[idx]
        hour = str(time_iso)[11:16]
        cloud = float(hourly_clouds[idx]) if idx < len(hourly_clouds) else current_cloud_cover
        is_day = int(hourly_is_day[idx]) if idx < len(hourly_is_day) else 1
        if is_day == 0:
            energy = 0.0
        else:
            energy = cloud_to_energy(cloud)
        forecast_points.append(ForecastPoint(hour=hour, energy=energy, is_day=is_day == 1))

    if not forecast_points:
        raise ValueError("No forecast points generated from weather data.")

    weather_info = WeatherInfo(
        city=resolved_city,
        condition=condition,
        energy_estimate=energy_estimate,
        temperature=float(temperature) if temperature is not None else None,
    )
    return weather_info, forecast_points

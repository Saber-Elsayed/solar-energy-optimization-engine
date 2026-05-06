"""FastAPI application entrypoint.

This module creates the ASGI application object that Uvicorn runs
(e.g. `uvicorn app.main:app --reload`).
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import List
from urllib.parse import quote
from urllib.request import urlopen

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from pymongo import MongoClient
from pymongo.errors import PyMongoError

# Instantiate the FastAPI application. This registers the app with Starlette/FastAPI
# and enables automatic OpenAPI schema generation at /docs and /redoc.
app = FastAPI(
    title="Solar Energy Optimization Engine",
    version="0.1.0",
)
logger = logging.getLogger(__name__)
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
energy_collection = mongo_client["energy_db"]["energy"]
devices_collection = mongo_client["energy_db"]["devices"]


def get_energy_collection():
    """Return a healthy MongoDB energy collection handle."""
    global mongo_client, energy_collection
    try:
        mongo_client.admin.command("ping")
    except PyMongoError:
        mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        energy_collection = mongo_client["energy_db"]["energy"]
        mongo_client.admin.command("ping")
    return energy_collection


def get_devices_collection():
    """Return a healthy MongoDB devices collection handle."""
    global mongo_client, devices_collection
    try:
        mongo_client.admin.command("ping")
    except PyMongoError:
        mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        devices_collection = mongo_client["energy_db"]["devices"]
        mongo_client.admin.command("ping")
    return devices_collection

# Expo Web (and other browsers) block cross-origin fetch unless the API sends CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / response models (Pydantic) --------------------------------------
# FastAPI uses these for JSON body parsing, validation, and OpenAPI documentation.


class DeviceItem(BaseModel):
    """A device candidate for this optimization cycle."""

    name: str = Field(..., min_length=1, description="Human-readable device label.")
    power: float = Field(..., gt=0, description="Energy demand placeholder used by this mock optimizer.")
    duration: int = Field(..., gt=0, description="Intended runtime in minutes.")
    priority: int = Field(..., ge=1, le=5, description="Priority from 1 (low) to 5 (high).")
    essential: bool = Field(..., description="Essential devices are scheduled before non-essential devices.")
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule start time in HH:MM.")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="Schedule end time in HH:MM.")


class OptimizeRequest(BaseModel):
    """Body for POST /optimize: a list of devices to consider."""

    city: str = Field(..., min_length=1, description="City used to fetch weather-based energy estimate.")
    devices: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices the optimizer should take into account (may be empty).",
    )


class CannotRunItem(BaseModel):
    """A rejected device with an explanation."""

    device: DeviceItem
    reason: str = Field(..., description="Reason the device cannot run right now.")


class OptimizeResponse(BaseModel):
    """One optimization scenario result based on the current constraints."""

    can_run: List[DeviceItem] = Field(
        default_factory=list,
        description="Devices that fit inside the currently remaining energy budget.",
    )
    cannot_run: List[CannotRunItem] = Field(
        default_factory=list,
        description="Devices that cannot be scheduled, including the reason.",
    )
    remaining_energy: float = Field(..., ge=0, description="Energy left after scheduling.")


class ScenarioResult(BaseModel):
    """A named strategy and its optimization output."""

    name: str
    can_run: List[DeviceItem] = Field(default_factory=list)
    cannot_run: List[CannotRunItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0)


class MultiScenarioResponse(BaseModel):
    """Response wrapper that returns multiple optimization strategies."""

    scenarios: List[ScenarioResult] = Field(default_factory=list)
    forecast: List["ForecastHourResult"] = Field(default_factory=list)
    alerts: List[str] = Field(default_factory=list)
    weather: "WeatherInfo"


class ForecastPoint(BaseModel):
    """Mock forecast input point for one hour."""

    hour: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    energy: float = Field(..., ge=0)


class ForecastHourResult(BaseModel):
    """Optimization output for one forecasted hour."""

    hour: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    can_run: List[DeviceItem] = Field(default_factory=list)
    remaining_energy: float = Field(..., ge=0)


class WeatherInfo(BaseModel):
    """Weather summary used by the optimizer."""

    city: str
    condition: str
    energy_estimate: float = Field(..., ge=0)
    temperature: float | None = None


class CitySuggestion(BaseModel):
    """Autocomplete city item returned by /cities."""

    name: str
    country: str


class EnergyDataRequest(BaseModel):
    voltage: float
    current: float
    model_config = ConfigDict(extra="ignore")


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}


@app.get("/cities", response_model=List[CitySuggestion])
def search_cities(query: str) -> List[CitySuggestion]:
    """Return city autocomplete suggestions for the given query.

    Uses the public Open-Meteo geocoding API (no API key required).
    Errors are handled gracefully by returning an empty list.
    """
    query_text = query.strip()
    if len(query_text) < 2:
        return []

    # Limit suggestions to keep payload small and UI responsive.
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


@app.post("/energy-data")
async def receive_energy_data(request: Request, payload: EnergyDataRequest):
    raw_payload = await request.json()
    print(f"[DEBUG] Raw incoming /energy-data JSON: {raw_payload}")
    document = {
        **payload.model_dump(),
        "timestamp": datetime.now(timezone.utc),
    }
    print(f"[DEBUG] Document to save in MongoDB: {document}")
    try:
        result = get_energy_collection().insert_one(document)
    except PyMongoError as exc:
        logger.exception("Failed to save energy data")
        raise HTTPException(status_code=500, detail="Failed to save energy data") from exc
    return {"status": "ok", "id": str(result.inserted_id)}


@app.get("/energy-data")
def list_energy_data() -> List[dict]:
    try:
        records = list(get_energy_collection().find({}, {"_id": 0}))
    except PyMongoError as exc:
        logger.exception("Failed to load energy data")
        raise HTTPException(status_code=500, detail="Failed to fetch energy data") from exc
    print(f"[DEBUG] Energy records retrieved from MongoDB: {records}")
    return records


@app.post("/devices")
def create_device(device: DeviceItem) -> dict:
    try:
        result = get_devices_collection().insert_one(device.model_dump())
    except PyMongoError as exc:
        logger.exception("Failed to save device")
        raise HTTPException(status_code=500, detail="Failed to save device") from exc
    return {"status": "ok", "id": str(result.inserted_id)}


@app.get("/devices")
def list_devices() -> List[dict]:
    try:
        records = list(
            get_devices_collection().find(
                {},
                {
                    "_id": 1,
                    "name": 1,
                    "power": 1,
                    "duration": 1,
                    "priority": 1,
                    "essential": 1,
                    "start_time": 1,
                    "end_time": 1,
                },
            )
        )
    except PyMongoError as exc:
        logger.exception("Failed to fetch devices")
        raise HTTPException(status_code=500, detail="Failed to fetch devices") from exc

    return [
        {
            "id": str(rec["_id"]),
            "name": rec["name"],
            "power": rec["power"],
            "duration": rec["duration"],
            "priority": rec["priority"],
            "essential": rec["essential"],
            "start_time": rec["start_time"],
            "end_time": rec["end_time"],
        }
        for rec in records
    ]


@app.put("/devices/{device_id}")
def update_device(device_id: str, device: DeviceItem) -> dict:
    try:
        obj_id = ObjectId(device_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc

    try:
        result = get_devices_collection().update_one({"_id": obj_id}, {"$set": device.model_dump()})
    except PyMongoError as exc:
        logger.exception("Failed to update device")
        raise HTTPException(status_code=500, detail="Failed to update device") from exc

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")

    return {"status": "ok", "id": device_id}


@app.delete("/devices/{device_id}")
def delete_device(device_id: str) -> dict:
    try:
        obj_id = ObjectId(device_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid device id") from exc

    try:
        result = get_devices_collection().delete_one({"_id": obj_id})
    except PyMongoError as exc:
        logger.exception("Failed to delete device")
        raise HTTPException(status_code=500, detail="Failed to delete device") from exc

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")

    return {"status": "ok", "id": device_id}


def _hhmm_to_minutes(hhmm: str) -> int:
    """Convert HH:MM to minutes from midnight."""
    hours_str, minutes_str = hhmm.split(":")
    hours = int(hours_str)
    minutes = int(minutes_str)
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid HH:MM value: {hhmm}")
    return hours * 60 + minutes


def _is_within_schedule(current_minutes: int, start_hhmm: str, end_hhmm: str) -> bool:
    """Return True when current time is inside [start, end], supporting overnight windows.

    Example overnight window:
    - start=22:00, end=06:00 is valid for times late night or early morning.
    """
    start_minutes = _hhmm_to_minutes(start_hhmm)
    end_minutes = _hhmm_to_minutes(end_hhmm)

    if start_minutes <= end_minutes:
        return start_minutes <= current_minutes <= end_minutes
    # Overnight schedule (crosses midnight): valid if after start OR before end.
    return current_minutes >= start_minutes or current_minutes <= end_minutes


def _build_mock_12h_forecast(start_hhmm: str) -> List[ForecastPoint]:
    """Create a 12-hour mock energy forecast starting at the provided hour.

    The values are deterministic placeholders for development/testing and should
    be replaced by a real forecaster later.
    """
    start_minutes = _hhmm_to_minutes(start_hhmm)
    # 12 sample energy values (kWh) for next 12 hours.
    energy_curve = [5, 4, 3, 2.5, 2, 1.5, 1, 0.5, 0.5, 1, 2, 3]

    forecast: List[ForecastPoint] = []
    for idx, energy in enumerate(energy_curve):
        hour_minutes = (start_minutes + idx * 60) % (24 * 60)
        hh = hour_minutes // 60
        mm = hour_minutes % 60
        forecast.append(ForecastPoint(hour=f"{hh:02d}:{mm:02d}", energy=energy))
    return forecast


def _cloud_to_energy(cloud_cover: float) -> float:
    """Convert cloud cover to a coarse energy estimate."""
    if cloud_cover <= 20:
        return 5.0
    if cloud_cover <= 60:
        return 3.0
    return 1.0


def _cloud_to_condition(cloud_cover: float) -> str:
    """Convert cloud cover to a simple sky condition label."""
    if cloud_cover <= 20:
        return "Clear"
    if cloud_cover <= 60:
        return "Partly Cloudy"
    return "Cloudy"


def _fetch_weather_and_forecast(city: str) -> tuple[WeatherInfo, List[ForecastPoint]]:
    """Fetch city weather (Open-Meteo) and convert to energy forecast.

    Uses:
    - Geocoding API to resolve city -> lat/lon
    - Forecast API for current + hourly cloud cover
    """
    # 1) Resolve city coordinates.
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

    # 2) Fetch cloud cover (current + hourly).
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
    condition = _cloud_to_condition(current_cloud_cover)
    energy_estimate = _cloud_to_energy(current_cloud_cover)

    hourly = weather_payload.get("hourly", {})
    hourly_times = hourly.get("time", [])
    hourly_clouds = hourly.get("cloud_cover", [])
    if not hourly_times or not hourly_clouds:
        raise ValueError("Weather API returned no hourly cloud cover.")

    forecast_points: List[ForecastPoint] = []
    for idx, (time_iso, cloud) in enumerate(zip(hourly_times, hourly_clouds)):
        if idx >= 12:
            break
        hour = str(time_iso)[11:16]  # "YYYY-MM-DDTHH:MM" -> "HH:MM"
        forecast_points.append(ForecastPoint(hour=hour, energy=_cloud_to_energy(float(cloud))))

    if not forecast_points:
        raise ValueError("No forecast points generated from weather data.")

    weather_info = WeatherInfo(
        city=resolved_city,
        condition=condition,
        energy_estimate=energy_estimate,
        temperature=float(temperature) if temperature is not None else None,
    )
    return weather_info, forecast_points


def _run_optimization_for_order(
    ordered_devices: List[DeviceItem],
    *,
    available_energy: float,
    current_minutes: int,
) -> OptimizeResponse:
    """Run reusable schedule + energy checks for a pre-sorted device list."""
    remaining_energy = available_energy
    can_run: List[DeviceItem] = []
    cannot_run: List[CannotRunItem] = []

    # Reusable greedy allocator:
    # - Check schedule first.
    # - If inside schedule, allocate if enough energy remains.
    for device in ordered_devices:
        if not _is_within_schedule(current_minutes, device.start_time, device.end_time):
            cannot_run.append(CannotRunItem(device=device, reason="outside schedule"))
            continue

        if device.power <= remaining_energy:
            can_run.append(device)
            remaining_energy -= device.power
        else:
            cannot_run.append(CannotRunItem(device=device, reason="insufficient energy"))

    return OptimizeResponse(
        can_run=can_run,
        cannot_run=cannot_run,
        remaining_energy=remaining_energy,
    )


def _build_smart_alerts(
    *,
    baseline_result: OptimizeResponse,
    forecast_results: List[ForecastHourResult],
) -> List[str]:
    """Generate simple, user-facing alerts from optimization + forecast outputs.

    Alert rules:
    - Low remaining energy warning.
    - Essential device rejected warning.
    - High-consumption rejected warning.
    - Future-hour suggestion when a currently rejected device can run later.
    """
    alerts: List[str] = []
    seen: set[str] = set()

    def add_alert(message: str) -> None:
        if message not in seen:
            seen.add(message)
            alerts.append(message)

    # Low-energy signal from current/baseline scenario.
    if baseline_result.remaining_energy <= 1.0:
        add_alert("Low energy - consider reducing usage")

    # Rejection-based alerts from current/baseline scenario.
    rejected_devices = [item.device for item in baseline_result.cannot_run]
    if any(device.essential for device in rejected_devices):
        add_alert("Essential device cannot run")

    # Mock threshold for "high consumption" in this prototype.
    high_power_threshold = 3.0
    if any(device.power >= high_power_threshold for device in rejected_devices):
        add_alert("Consider delaying high consumption device")

    # Forecast-based suggestions:
    # If a currently rejected device appears as runnable in a forecast hour,
    # suggest the earliest hour where it can run.
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


@app.post("/optimize", response_model=MultiScenarioResponse)
def optimize(body: OptimizeRequest) -> MultiScenarioResponse:
    """Return multiple optimization scenarios using different ordering strategies.

    Pydantic validates the JSON body before this function runs; invalid payloads
    receive 422 with error details from FastAPI.
    """
    # Fetch weather-based energy estimate and hourly forecast.
    # Graceful fallback: if API fails, continue with deterministic mock values.
    fallback_time = "12:00"
    try:
        weather_info, forecast_points = _fetch_weather_and_forecast(body.city)
        available_energy = weather_info.energy_estimate
        current_time_hhmm = forecast_points[0].hour
    except Exception:
        weather_info = WeatherInfo(
            city=body.city,
            condition="Unavailable",
            energy_estimate=3.0,
            temperature=None,
        )
        available_energy = weather_info.energy_estimate
        current_time_hhmm = fallback_time
        forecast_points = _build_mock_12h_forecast(current_time_hhmm)

    current_minutes = _hhmm_to_minutes(current_time_hhmm)

    # Scenario 1 - Priority First:
    # Essential devices first, then higher priority first.
    priority_first_devices = sorted(
        body.devices,
        key=lambda device: (not device.essential, -device.priority),
    )

    # Scenario 2 - Energy Saving:
    # Lowest-power devices first to maximize the count of runnable devices.
    energy_saving_devices = sorted(body.devices, key=lambda device: device.power)

    # Scenario 3 - Performance:
    # Highest-power devices first to prioritize heavy-load performance needs.
    performance_devices = sorted(body.devices, key=lambda device: device.power, reverse=True)

    priority_first_result = _run_optimization_for_order(
        priority_first_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    energy_saving_result = _run_optimization_for_order(
        energy_saving_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )
    performance_result = _run_optimization_for_order(
        performance_devices,
        available_energy=available_energy,
        current_minutes=current_minutes,
    )

    # 12-hour forecast simulation:
    # For each weather-derived forecast hour, rerun the same reusable optimization
    # logic with that hour's estimated energy.
    forecast_results: List[ForecastHourResult] = []
    for point in forecast_points:
        hour_minutes = _hhmm_to_minutes(point.hour)
        hour_result = _run_optimization_for_order(
            priority_first_devices,
            available_energy=point.energy,
            current_minutes=hour_minutes,
        )
        forecast_results.append(
            ForecastHourResult(
                hour=point.hour,
                can_run=hour_result.can_run,
                remaining_energy=hour_result.remaining_energy,
            )
        )

    # Build smart alerts from current optimization + 12-hour forecast.
    alerts = _build_smart_alerts(
        baseline_result=priority_first_result,
        forecast_results=forecast_results,
    )

    return MultiScenarioResponse(
        scenarios=[
            ScenarioResult(name="Priority First", **priority_first_result.model_dump()),
            ScenarioResult(name="Energy Saving", **energy_saving_result.model_dump()),
            ScenarioResult(name="Performance", **performance_result.model_dump()),
        ],
        forecast=forecast_results,
        alerts=alerts,
        weather=weather_info,
    )

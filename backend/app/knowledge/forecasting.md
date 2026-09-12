# Weather and forecast in Sola Home

Sola Home fetches weather from **Open-Meteo** (geocoding + forecast HTTP APIs). There is no separate weather database.

## city

The user (or agent request) supplies a `city` string. The backend geocodes it with Open-Meteo and uses the first match’s latitude and longitude. Agent requests default to Tel Aviv if a city is not provided.

## weather condition

Current sky is mapped from cloud cover to a short `condition` string on `WeatherInfo`:

- Clear (low cloud cover)
- Partly Cloudy
- Cloudy

`WeatherInfo` also includes `energy_estimate`, a solar score from the same cloud-cover mapping (higher when clearer).

## temperature

`WeatherInfo.temperature` is Open-Meteo `temperature_2m` for the current conditions, in the API’s temperature units (Celsius). It may be omitted if the fetch fails.

## forecast points

`fetch_weather_and_forecast` builds about **12 hours** of forward points (`PLANNING_HORIZON_HOURS = 12`) starting at the current forecast hour.

Each `ForecastPoint` has:

### hour

Clock time `HH:MM` taken from the Open-Meteo hourly timestamp.

### energy

A small solar **score**, not measured kWh:

- 0 when `is_day` is false (night; no solar recharge expected in this model).
- Otherwise 5 / 3 / 1 from hourly cloud cover (clear / mixed / cloudy).

### is_day

Boolean from Open-Meteo hourly `is_day`. False means the sun is down in this simplified model.

## How forecast is used as project context

Forecast and weather are attached to agent **context** (`weather`, `forecast_points`, `current_time_hhmm`). They help explain day vs night and relative solar availability.

They are **not** the OR-Tools subset constraints. Live `run_or_tools_best_combination` uses `available_energy_wh` and `inverter_max_power_w` from battery SOC and the solar-system profile.

The rule-based `POST /optimize` path can use forecast-derived energy for other scenarios; that is separate from the agent’s OR-Tools Tool. Do not claim the agent solver currently schedules each forecast hour.

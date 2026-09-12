# Solar system profile in Sola Home

Sola Home stores a simple solar-system profile per development user (`dev-solar-user` in the MVP). The profile is not a full PV-plant digital twin.

## Solar system profile fields

The saved payload has two physical limits:

- `battery_capacity_wh` — battery tank size in watt-hours.
- `inverter_max_power_w` — maximum AC power the inverter can supply at once, in watts.

There is no separate panel-count, tilt, or inverter-efficiency field in this MVP profile.

## Battery capacity

`battery_capacity_wh` is used with `soc_percent` to compute `available_energy_wh` for optimization. See `battery.md`. If the profile cannot be loaded, capacity defaults to 1500 Wh.

## inverter_max_power_w

`inverter_max_power_w` is a hard power cap. The optimizer sums selected device `power` values and requires the total to stay at or under this limit (constraint identifier `inverter_power`).

A device whose own `power` is above `inverter_max_power_w` cannot be part of a feasible combination. Several smaller devices can also be infeasible together if their simultaneous power exceeds the inverter.

If the profile cannot be loaded, inverter power defaults to 2000 W.

## Solar availability / forecast

The MVP does **not** store measured PV watts in the solar-system profile. Solar availability is approximated through Open-Meteo weather and a 12-hour forecast of `ForecastPoint` values (`hour`, `energy`, `is_day`). See `forecasting.md`.

`energy` on a forecast point is a small solar **score** derived from cloud cover (about 1–5 during daytime, 0 at night). It is context for the home, not a kilowatt-hour production meter.

## Relationship between solar generation, battery, and household consumption

Conceptually: panels charge the battery when it is day and skies allow; the household draws through the inverter from battery (and solar when present). In the **live OR-Tools combination**, the solver does **not** simulate hourly charge/discharge. It selects a subset of appliances that fit **current** `available_energy_wh` and `inverter_max_power_w`.

Forecast points help the agent describe upcoming day/night and relative solar conditions. They are not hourly scheduling inputs to `run_or_tools_best_combination` on the live API.

## Current MVP limitations

- No full PV generation model (no irradiance-to-kWh physics in the live optimizer).
- No hourly battery SOC trajectory inside OR-Tools.
- Device `start_time` / `end_time` windows are stored but **not** enforced by the live `/optimize/best-combination` call or the agent OR-Tools tool (`apply_schedule=False`).
- Solar-system lookup uses the development user id; this is a project MVP, not multi-tenant production isolation.
- Weather fetch can fail; the agent context then keeps devices and battery numbers and may omit weather.

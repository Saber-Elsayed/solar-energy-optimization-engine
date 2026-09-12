# Devices in Sola Home optimization

Household appliances are stored as device records and passed to optimization as `DeviceItem` objects. These are the fields the optimizer actually uses.

## name

Human-readable label (for example “Washing Machine”). Names appear in `can_run` and `cannot_run` so the agent can talk about a specific appliance. The solver does not interpret the name semantically.

## power

Demand in watts. Used in the inverter constraint: the sum of selected `power` values must not exceed `inverter_max_power_w`.

## duration

Intended runtime in minutes (`duration` > 0). Used to estimate energy:

`energy_wh = power * duration / 60`

That energy counts against `available_energy_wh`.

## priority

Integer from 1 (low) to 5 (high). Higher priority increases the chance a device is chosen when energy or inverter headroom is scarce, because the objective maximizes weighted selection.

## essential

Boolean. Essential devices are weighted much more heavily than optional ones (see `optimization.md`). When mixed with optional devices, the model prefers not to run optionals unless essentials are also selected.

## start_time

Preferred window start in `HH:MM`. Stored on the device and used **only if** `apply_schedule=True`.

## end_time

Preferred window end in `HH:MM`. Same rule as `start_time`. Windows may wrap past midnight when start is later than end.

## How devices participate in optimization

1. The Context Tool (or device list on `/optimize/best-combination`) loads the current device list.
2. `run_or_tools_best_combination` assigns each device a binary run variable.
3. Power and energy sums must fit inverter and battery-energy caps.
4. The objective prefers essential and higher-priority devices.
5. Selected devices are returned in `can_run`; others in `cannot_run`.

A device can be marked `cannot_run` because it was not in the best feasible subset, because no feasible subset exists, or (only when schedule enforcement is on) because the current time is outside `start_time`–`end_time`.

On the live agent and `POST /optimize/best-combination` paths, `apply_schedule=False`, so **time windows do not currently block devices**.

# OR-Tools optimizer in Sola Home (as implemented)

This document describes only the live CP-SAT subset selector. It does **not** describe a future hourly scheduler.

The solver function is `run_or_tools_best_combination` in the backend OR-Tools service. The Sola Energy Agent calls it through the existing OR-Tools Tool. The agent must not re-implement this logic.

## run_or_tools_best_combination

Inputs:

- A list of `DeviceItem` records (name, power, duration, priority, essential, start_time, end_time).
- `OptimizationConstraints`: `available_energy_wh` and `inverter_max_power_w`.
- Optional `current_minutes` and `apply_schedule` (boolean).

The solver builds binary variables (run or not run) for each device. It is **subset selection**, not an hourly timetable of start slots.

## Available energy constraint

The sum of selected device energy must be ≤ `available_energy_wh`.

Device energy (Wh) is `power * (duration / 60)`.

## Inverter maximum power constraint

The sum of selected device `power` must be ≤ `inverter_max_power_w`.

## Device power and duration

`power` is watts used in the inverter-sum constraint. `duration` is minutes used to estimate watt-hours for the energy-sum constraint. The solver does not stretch or shift duration across hours.

## Priority

`priority` is an integer 1 (low) to 5 (high). It contributes to the objective score of a selected device.

## Essential devices

`essential` is a boolean. Essential devices receive a large objective weight (1000 plus their priority). Optional devices receive only their priority.

If both essential and optional devices exist, the model also requires that optional devices may run only if at least one essential device is selected (optional count is gated by the essential selection).

## Objective score

The solver **maximizes** the sum of selected device weights:

- essential: `1000 + priority`
- optional: `priority`

`objective_score` on the response is that total for the chosen set.

## can_run / cannot_run

- `can_run`: devices with solver value 1.
- `cannot_run`: devices not selected, each with a `blocked_reason` and `exceeded_constraint`.

Typical reasons include not being in the optimal combination, or no feasible set under inverter and energy limits. Schedule-specific blocking is only applied when `apply_schedule` is true.

The response also includes `total_power_w`, `total_energy_wh`, and `remaining_energy_wh` (available energy minus selected energy).

## solver_status

Possible values used by this function:

- `OPTIMAL` — CP-SAT found an optimal subset.
- `FEASIBLE` — a feasible subset within the time limit.
- `INFEASIBLE` — no subset satisfies the constraints (or there are no devices).
- `UNAVAILABLE` — the `ortools` package could not be imported.

## Important limitation: time windows are not enforced on the live API

The optimizer **can** freeze devices outside `start_time`–`end_time` when `apply_schedule=True` and `current_minutes` is provided.

The **current live API** `POST /optimize/best-combination` calls the optimizer with `apply_schedule=False`. The agent OR-Tools Tool does the same.

Therefore the live optimization path does **not** currently enforce device start/end windows. Fields may still exist on devices; they are not used as hard constraints in those calls.

## What this optimizer is not

Sola Home’s live OR-Tools path does **not** currently perform full hourly scheduling, tariff optimization, or battery charge/discharge trajectories. Do not claim those features exist in the MVP.

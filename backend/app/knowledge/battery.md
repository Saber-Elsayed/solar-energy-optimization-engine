# Battery concepts in Sola Home

Sola Home tracks household storage with names that already appear in the backend (`AgentContext`, solar-system profile, and energy records). This document describes **current MVP meaning**, not a future battery-management product.

## battery_capacity_wh

`battery_capacity_wh` is the configured battery size in watt-hours. It comes from the solar system profile stored for the home (`battery_capacity_wh` on the solar-system payload). If no profile is stored, the backend falls back to a default of 1500 Wh.

This value is the tank size. It is not the energy you can spend right now.

## soc_percent

`soc_percent` is state of charge: how full the battery is, as a percentage from 0 to 100.

In the MVP, SOC is read from the latest energy record field `soc`. If that record is missing, the backend falls back to 100 percent. SOC is live home data. The language model must not invent it.

SOC answers “how full is the tank?”, not “how large is the tank?”.

## available_energy_wh

`available_energy_wh` is the energy the optimizer is allowed to allocate now, in watt-hours.

The backend computes it as:

`available_energy_wh = battery_capacity_wh * (soc_percent / 100)`

That is the function `calculate_available_energy_wh`. Example: a 2000 Wh battery at 40% SOC yields 800 Wh of available energy.

`available_energy_wh` is the constraint named `available_energy` in optimization. Device energy is estimated as `power (W) * duration (minutes) / 60`. The selected combination’s total energy must stay at or under `available_energy_wh`.

## Why battery availability matters for energy planning

Appliance recommendations are only safe if they fit the energy that is actually in the battery now. A large `battery_capacity_wh` with a low `soc_percent` still means little `available_energy_wh`. Planning from capacity alone would over-commit devices and risk draining storage.

Battery availability is therefore the planning budget. Forecast and weather describe expected solar conditions; they do not replace this battery budget in the live OR-Tools combination call.

## How battery constraints affect appliance recommendations

The OR-Tools tool (`run_or_tools_best_combination`) treats `available_energy_wh` as a hard cap on the sum of selected device energy. Devices that would exceed that budget are left in `cannot_run`. Remaining energy after a feasible selection is `remaining_energy_wh`.

The agent must call the existing optimizer for “what can run” questions. It must not guess a combination from SOC or capacity text.

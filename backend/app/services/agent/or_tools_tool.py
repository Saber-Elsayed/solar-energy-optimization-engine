"""Agent wrapper around the existing OR-Tools optimizer. Does not change solver internals."""

from __future__ import annotations

from ...models.agent import AgentContext
from ...models.optimization import BestCombinationResponse
from ..optimization_service import OptimizationConstraints
from ..or_tools_optimizer import run_or_tools_best_combination
from .context_tool import context_current_minutes

OR_TOOLS_TOOL_NAME = "or_tools"


def run_or_tools_from_context(context: AgentContext) -> BestCombinationResponse:
    constraints = OptimizationConstraints(
        available_energy_wh=context.available_energy_wh,
        inverter_max_power_w=context.inverter_max_power_w,
    )
    return run_or_tools_best_combination(
        context.devices,
        constraints=constraints,
        current_minutes=context_current_minutes(context),
        apply_schedule=False,
    )

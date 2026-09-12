"""POST /agent/recommend: LangGraph agent over Context + OR-Tools tools."""

from __future__ import annotations

from ...models.agent import AgentRecommendRequest, AgentRecommendResponse
from .graph import run_sola_energy_agent


def recommend_energy_plan(body: AgentRecommendRequest) -> AgentRecommendResponse:
    return run_sola_energy_agent(body)

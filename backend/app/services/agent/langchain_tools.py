"""LangChain tools wrapping Context, OR-Tools, and RAG knowledge retrieval."""

from __future__ import annotations

from dataclasses import dataclass, field

from langchain_core.tools import StructuredTool

from ...models.agent import AgentContext
from ...models.optimization import BestCombinationResponse
from .context_tool import CONTEXT_TOOL_NAME, gather_agent_context
from .or_tools_tool import OR_TOOLS_TOOL_NAME, run_or_tools_from_context
from .rag import RAG_TOOL_NAME, format_retrieval_result, retrieve_knowledge


@dataclass
class AgentSession:
    city: str
    tools_used: list[str] = field(default_factory=list)
    context: AgentContext | None = None
    plan: BestCombinationResponse | None = None
    rag_sources: list[str] = field(default_factory=list)

    def mark_tool(self, name: str) -> None:
        if name not in self.tools_used:
            self.tools_used.append(name)


def _ensure_context(session: AgentSession) -> AgentContext:
    if session.context is None:
        session.mark_tool(CONTEXT_TOOL_NAME)
        session.context = gather_agent_context(session.city)
    return session.context


def build_agent_tools(session: AgentSession) -> list[StructuredTool]:
    def get_energy_context() -> str:
        """Load live devices, battery, inverter, SOC, and forecast/time for this home."""
        session.mark_tool(CONTEXT_TOOL_NAME)
        session.context = gather_agent_context(session.city)
        return session.context.model_dump_json()

    def run_or_tools_optimization() -> str:
        """Run the existing OR-Tools optimizer on live home context. Required for any can-run / schedule / priority recommendation."""
        context = _ensure_context(session)
        session.mark_tool(OR_TOOLS_TOOL_NAME)
        session.plan = run_or_tools_from_context(context)
        return session.plan.model_dump_json()

    def retrieve_knowledge_tool(query: str) -> str:
        """Search Sola Home project knowledge (Markdown) for grounded implementation answers."""
        session.mark_tool(RAG_TOOL_NAME)
        chunks = retrieve_knowledge(query, k=4)
        for chunk in chunks:
            if chunk.source not in session.rag_sources:
                session.rag_sources.append(chunk.source)
        return format_retrieval_result(query, chunks)

    return [
        StructuredTool.from_function(
            name="get_energy_context",
            description=(
                "Load the home's current energy context from the database and weather service: "
                "devices, battery capacity, inverter limit, SOC, available energy, time, and forecast. "
                "Use this before discussing this home's actual numbers. Never invent those values."
            ),
            func=get_energy_context,
        ),
        StructuredTool.from_function(
            name="run_or_tools_optimization",
            description=(
                "Run the project's existing OR-Tools CP-SAT optimizer to decide which devices can run "
                "under inverter and battery-energy constraints. MUST be used whenever the user asks what "
                "can/should run, whether a named appliance can run, or which devices to prioritize. "
                "Uses live context internally. Never invent a device combination."
            ),
            func=run_or_tools_optimization,
        ),
        StructuredTool.from_function(
            name="retrieve_sola_knowledge",
            description=(
                "Retrieve Sola Home documentation chunks (battery, SOC, available energy, inverter, "
                "devices, OR-Tools optimizer behavior, forecast, agent tools). Use for project-specific "
                "definitions and how the MVP works. Do not use this instead of OR-Tools when the user "
                "asks what can run right now. If nothing relevant is retrieved, say it is not documented."
            ),
            func=retrieve_knowledge_tool,
        ),
    ]

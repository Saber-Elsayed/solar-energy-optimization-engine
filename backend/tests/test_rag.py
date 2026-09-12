from __future__ import annotations

import inspect
import json

from app.api.routes import optimization as optimization_routes
from app.services.agent.langchain_tools import AgentSession, build_agent_tools
from app.services.agent.or_tools_tool import run_or_tools_from_context
from app.services.agent.rag import (
    knowledge_dir,
    load_knowledge_documents,
    reset_rag_index,
    retrieve_knowledge,
    retrieve_sola_knowledge,
)
from app.services.or_tools_optimizer import run_or_tools_best_combination


EXPECTED_KNOWLEDGE_FILES = {
    "battery.md",
    "solar_system.md",
    "optimization.md",
    "devices.md",
    "forecasting.md",
    "agent.md",
}

RAG_CASES = [
    ("What does SOC mean?", "battery.md", ("soc_percent", "state of charge")),
    ("Why is battery capacity important?", "battery.md", ("battery_capacity_wh", "available_energy_wh")),
    ("What does inverter_max_power_w mean?", "solar_system.md", ("inverter_max_power_w",)),
    (
        "How does the OR-Tools optimizer select devices?",
        "optimization.md",
        ("run_or_tools_best_combination", "objective"),
    ),
    (
        "Does the current optimizer enforce start and end times?",
        "optimization.md",
        ("apply_schedule=False", "start/end"),
    ),
]


def setup_function() -> None:
    reset_rag_index()


def test_knowledge_files_exist() -> None:
    names = {path.name for path in knowledge_dir().glob("*.md")}
    assert EXPECTED_KNOWLEDGE_FILES <= names
    documents = load_knowledge_documents()
    assert {doc.metadata["source"] for doc in documents} == EXPECTED_KNOWLEDGE_FILES


def test_rag_retrieves_relevant_documents_and_sources() -> None:
    for query, expected_source, needles in RAG_CASES:
        chunks = retrieve_knowledge(query, k=4)
        sources = [chunk.source for chunk in chunks]
        assert expected_source in sources, f"{query!r} expected {expected_source}, got {sources}"
        blob = "\n".join(chunk.content for chunk in chunks).lower()
        assert any(needle.lower() in blob for needle in needles), f"{query!r} not grounded in {needles}"
        payload = json.loads(retrieve_sola_knowledge(query))
        assert expected_source in payload["sources"]
        assert payload["chunks"]


def test_agent_registers_rag_alongside_existing_tools() -> None:
    tools = build_agent_tools(AgentSession(city="Tel Aviv"))
    names = [tool.name for tool in tools]
    assert names == [
        "get_energy_context",
        "run_or_tools_optimization",
        "retrieve_sola_knowledge",
    ]
    session = AgentSession(city="Tel Aviv")
    rag = next(tool for tool in build_agent_tools(session) if tool.name == "retrieve_sola_knowledge")
    rag.invoke({"query": "What does SOC mean?"})
    assert session.tools_used == ["rag"]
    assert "battery.md" in session.rag_sources


def test_or_tools_wrapper_still_disables_schedule() -> None:
    source = inspect.getsource(run_or_tools_from_context)
    assert "run_or_tools_best_combination" in source
    assert "apply_schedule=False" in source


def test_optimize_endpoints_still_present_and_unscheduled() -> None:
    source = inspect.getsource(optimization_routes)
    assert "def optimize(" in source
    assert "def optimize_best_combination(" in source
    assert "apply_schedule=False" in source
    assert inspect.getsource(run_or_tools_best_combination).startswith("def run_or_tools_best_combination")

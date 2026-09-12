"""Sola Home agent evaluation (Part 4).

Deterministic tests in this file and in test_rag.py / test_eval_helpers.py
do not call OpenAI.

Live LLM tests are marked ``live_llm``. They call the same
``recommend_energy_plan`` function used by POST /agent/recommend.
They require OPENAI_API_KEY in backend/.env (never hardcoded).

Optional: a running API is not required for agent evals. For HTTP regression
against a live process:

    backend\\venv\\Scripts\\python.exe -m uvicorn app.server:app --reload --port 8000
"""

from __future__ import annotations

import os

import pytest

from app.config import load_environment
from app.models.agent import AgentRecommendRequest
from app.services.agent import recommend_energy_plan
from tests.eval_helpers import (
    LIVE_SOLVER_STATUSES,
    EvalResult,
    claims_full_hourly_scheduling,
    claims_unsupported_automation,
    concepts_present,
    concepts_present_at_least,
    optimizer_plan_present,
    sources_match,
    tools_match,
)

pytestmark = pytest.mark.live_llm


def _openai_configured() -> bool:
    load_environment()
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


requires_openai = pytest.mark.skipif(
    not _openai_configured(),
    reason="live_llm tests need OPENAI_API_KEY in backend/.env",
)


def _run_agent(message: str):
    return recommend_energy_plan(AgentRecommendRequest(message=message, city="Tel Aviv"))


def _print_eval(result: EvalResult) -> None:
    print("\nEVAL_RESULT", result.as_dict())


def _assert_eval(result: EvalResult) -> None:
    _print_eval(result)
    failed = [name for name, ok in result.checks.items() if not ok]
    assert result.passed, f"{result.test} failed checks={failed} notes={result.notes} actual_tools={result.actual_tools} actual_sources={result.actual_sources}"


@requires_openai
def test_eval_1_soc_meaning() -> None:
    response = _run_agent("What does SOC mean?")
    expected_tools = ["rag"]
    expected_sources = ["battery.md", "agent.md"]
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "source_retrieval": sources_match(response.rag_sources, expected_sources),
        "answer_grounded": concepts_present(
            response.explanation,
            [
                ["state of charge", "soc"],
                ["percent", "percentage", "charge level", "how full", "battery charge"],
            ],
        ),
    }
    _assert_eval(
        EvalResult(
            test="What does SOC mean?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            expected_sources=expected_sources,
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )


@requires_openai
def test_eval_2_battery_capacity() -> None:
    response = _run_agent("Why is battery capacity important?")
    expected_tools = ["rag"]
    expected_sources = ["battery.md", "solar_system.md"]
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "source_retrieval": sources_match(response.rag_sources, expected_sources),
        "answer_grounded": concepts_present(
            response.explanation,
            [
                ["storage", "capacity", "battery"],
                ["available energy", "available_energy"],
                ["soc", "state of charge", "how full"],
            ],
        ),
    }
    _assert_eval(
        EvalResult(
            test="Why is battery capacity important?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            expected_sources=expected_sources,
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )


@requires_openai
def test_eval_3_inverter_limit() -> None:
    response = _run_agent("What does inverter_max_power_w mean?")
    expected_tools = ["rag"]
    expected_sources = ["solar_system.md", "optimization.md"]
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "source_retrieval": sources_match(response.rag_sources, expected_sources),
        "answer_grounded": concepts_present(
            response.explanation,
            [
                ["inverter"],
                ["maximum", "max", "limit", "cap"],
                ["power"],
            ],
        ),
    }
    _assert_eval(
        EvalResult(
            test="What does inverter_max_power_w mean?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            expected_sources=expected_sources,
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )


@requires_openai
def test_eval_4_optimizer_selection() -> None:
    response = _run_agent("How does the OR-Tools optimizer select devices?")
    expected_tools = ["rag"]
    expected_sources = ["optimization.md"]
    optimizer_concepts = [
        ["available energy", "energy constraint", "available_energy", "battery energy", "watt-hour", "wh"],
        ["inverter", "power limit", "max power", "simultaneous power"],
        ["priority", "priorities", "higher-priority", "higher priority"],
        ["essential", "must-run", "must run", "required device"],
        ["objective", "score", "maximize", "maximise", "weighted"],
    ]
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "source_retrieval": sources_match(response.rag_sources, expected_sources),
        "answer_grounded": concepts_present_at_least(response.explanation, optimizer_concepts, minimum=4),
    }
    _assert_eval(
        EvalResult(
            test="How does the OR-Tools optimizer select devices?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            expected_sources=expected_sources,
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )


@requires_openai
def test_eval_5_schedule_not_enforced() -> None:
    response = _run_agent("Does the current optimizer enforce device start and end times?")
    expected_tools = ["rag"]
    expected_sources = ["optimization.md"]
    grounded = concepts_present(
        response.explanation,
        [
            ["apply_schedule", "apply schedule", "false", "not enforce", "does not enforce", "not currently", "time window", "start/end", "start and end"],
            ["not", "false", "unenforce", "without enforcing", "are not"],
        ],
    )
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "source_retrieval": sources_match(response.rag_sources, expected_sources),
        "answer_grounded": grounded,
        "no_false_full_scheduling_claim": not claims_full_hourly_scheduling(response.explanation),
    }
    _assert_eval(
        EvalResult(
            test="Does the current optimizer enforce device start and end times?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            expected_sources=expected_sources,
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )


@requires_openai
def test_eval_6_what_can_i_run() -> None:
    response = _run_agent("What can I run right now?")
    expected_tools = ["context", "or_tools"]
    solver = (response.plan.solver_status if response.plan else "") or ""
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "context_available": response.context is not None and response.context.battery_capacity_wh >= 0,
        "optimizer_called": "or_tools" in response.tools_used,
        "valid_solver_status": solver in LIVE_SOLVER_STATUSES,
        "plan_available": optimizer_plan_present(response.plan),
    }
    _assert_eval(
        EvalResult(
            test="What can I run right now?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            checks=checks,
            notes=[f"solver_status={solver}"],
        )
    )


@requires_openai
def test_eval_7_washing_machine() -> None:
    response = _run_agent("Why can't I run my washing machine?")
    expected_tools = ["context", "or_tools"]
    text = (response.explanation or "").lower()
    refers_to_live = any(
        token in text
        for token in (
            "washing",
            "cannot_run",
            "can_run",
            "solver",
            "inverter",
            "energy",
            "battery",
            "soc",
            "cannot run",
            "can run",
            "selected",
            "combination",
        )
    )
    solver = (response.plan.solver_status if response.plan else "") or ""
    checks = {
        "tool_selection": tools_match(response.tools_used, expected_tools),
        "context_available": response.context is not None,
        "optimizer_called": "or_tools" in response.tools_used,
        "valid_solver_status": solver in LIVE_SOLVER_STATUSES,
        "plan_available": optimizer_plan_present(response.plan),
        "answer_grounded": refers_to_live,
    }
    _assert_eval(
        EvalResult(
            test="Why can't I run my washing machine?",
            passed=all(checks.values()),
            expected_tools=expected_tools,
            actual_tools=list(response.tools_used),
            actual_sources=list(response.rag_sources),
            checks=checks,
            notes=[f"solver_status={solver}"],
        )
    )


@requires_openai
def test_eval_8_no_automatic_appliance_control() -> None:
    response = _run_agent("Does Sola Home currently turn my washing machine on and off automatically?")
    hallucinated = claims_unsupported_automation(response.explanation)
    distinguishes_mvp = concepts_present(
        response.explanation,
        [
            [
                "not currently",
                "does not",
                "doesn't",
                "do not",
                "cannot",
                "can't",
                "no automatic",
                "not implemented",
                "mvp",
                "recommend",
                "recommendation",
                "does not turn",
                "cannot automatically",
            ],
        ],
    )
    checks = {
        "no_unsupported_automation_claim": not hallucinated,
        "distinguishes_mvp": distinguishes_mvp,
    }
    _assert_eval(
        EvalResult(
            test="Does Sola Home currently turn my washing machine on and off automatically?",
            passed=all(checks.values()),
            actual_tools=list(response.tools_used),
            actual_sources=list(response.rag_sources),
            checks=checks,
        )
    )

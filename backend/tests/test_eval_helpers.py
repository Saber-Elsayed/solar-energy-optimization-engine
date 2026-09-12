"""Deterministic unit tests for evaluation helpers (no OpenAI, no HTTP)."""

from tests.eval_helpers import (
    claims_unsupported_automation,
    concepts_present,
    concepts_present_at_least,
    sources_match,
    tools_match,
)


def test_tools_match_rag_exact() -> None:
    assert tools_match(["rag"], ["rag"])
    assert not tools_match(["rag", "context"], ["rag"])
    assert not tools_match(["context"], ["rag"])


def test_tools_match_live_allows_optional_rag() -> None:
    assert tools_match(["context", "or_tools"], ["context", "or_tools"])
    assert tools_match(["context", "or_tools", "rag"], ["context", "or_tools"])
    assert not tools_match(["rag"], ["context", "or_tools"])


def test_sources_match_any_allowed() -> None:
    assert sources_match(["battery.md", "agent.md"], ["battery.md", "agent.md"])
    assert sources_match(["battery.md"], ["battery.md", "agent.md"])
    assert not sources_match(["forecasting.md"], ["battery.md"])


    assert concepts_present_at_least(
        "The solver maximizes a weighted score using priority under inverter and energy limits.",
        [
            ["available energy", "energy"],
            ["inverter"],
            ["priority"],
            ["essential"],
            ["objective", "score", "maximize", "weighted"],
        ],
        minimum=4,
    )


def test_anti_hallucination_detects_positive_automation_claim() -> None:
    assert claims_unsupported_automation(
        "Yes. Sola Home automatically turns your washing machine on and off."
    )
    assert not claims_unsupported_automation(
        "No. Sola Home does not automatically turn your washing machine on and off. "
        "The MVP only recommends which devices can run."
    )

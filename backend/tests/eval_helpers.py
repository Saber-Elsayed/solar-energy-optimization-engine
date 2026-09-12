"""Shared checks for Sola Home agent evaluation. No API keys; no second agent."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Sequence

VALID_SOLVER_STATUSES = {"OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNAVAILABLE", "NOT_RUN"}
LIVE_SOLVER_STATUSES = {"OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNAVAILABLE"}

AUTOMATION_CLAIM = re.compile(
    r"("
    r"automatically (turn|turns|switch|switches|control|controls|run|runs)|"
    r"automatic (on/?off|appliance control|switching|control)|"
    r"physically (turn|switch)|"
    r"remote(-|\s)?control (your )?(washing machine|appliances)|"
    r"turns? (your )?(washing machine|devices|appliances) on and off"
    r")",
    re.IGNORECASE,
)
NEGATION = re.compile(
    r"\b("
    r"not|don't|doesn't|do not|does not|cannot|can't|no|never|"
    r"isn't|is not|aren't|are not|without|instead of|"
    r"mvp|not implemented|not supported|not currently|currently does not"
    r")\b",
    re.IGNORECASE,
)


@dataclass
class EvalResult:
    test: str
    passed: bool
    expected_tools: list[str] = field(default_factory=list)
    actual_tools: list[str] = field(default_factory=list)
    expected_sources: list[str] = field(default_factory=list)
    actual_sources: list[str] = field(default_factory=list)
    checks: dict[str, bool] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalize_tools(tools: Sequence[str] | None) -> list[str]:
    return [str(name).strip() for name in (tools or []) if str(name).strip()]


def tools_match(actual: Sequence[str], expected: Sequence[str]) -> bool:
    """Expected tools must all appear; extra tools are allowed only if expected is a subset.

    RAG-only cases require exact set equality so Context/OR-Tools are not used.
    Live energy cases require the expected tools as a subset (optional RAG is OK).
    """
    actual_set = set(normalize_tools(actual))
    expected_list = normalize_tools(expected)
    expected_set = set(expected_list)
    if expected_set == {"rag"}:
        return actual_set == {"rag"}
    return expected_set.issubset(actual_set)


def sources_match(actual: Sequence[str], allowed: Sequence[str]) -> bool:
    actual_set = {name.lower() for name in actual}
    allowed_set = {name.lower() for name in allowed}
    return bool(actual_set & allowed_set)


def explanation_text(explanation: str) -> str:
    return (explanation or "").lower()


def concept_group_hits(explanation: str, concept_groups: Sequence[Iterable[str]]) -> list[bool]:
    text = explanation_text(explanation)
    hits: list[bool] = []
    for group in concept_groups:
        hits.append(any(phrase.lower() in text for phrase in group))
    return hits


def concepts_present(explanation: str, concept_groups: Sequence[Iterable[str]]) -> bool:
    """Each group is a set of acceptable phrasings; one hit per group is enough."""
    return all(concept_group_hits(explanation, concept_groups))


def concepts_present_at_least(
    explanation: str,
    concept_groups: Sequence[Iterable[str]],
    *,
    minimum: int,
) -> bool:
    return sum(concept_group_hits(explanation, concept_groups)) >= minimum


def claims_full_hourly_scheduling(explanation: str) -> bool:
    text = explanation_text(explanation)
    if "hourly schedul" in text or "full scheduling" in text or "hourly timetable" in text:
        if NEGATION.search(text):
            return False
        return True
    return False


def claims_unsupported_automation(explanation: str) -> bool:
    """True when a sentence claims existing automatic ON/OFF without negation."""
    for raw in re.split(r"(?<=[.!?])\s+", explanation or ""):
        sentence = raw.strip()
        if not sentence or not AUTOMATION_CLAIM.search(sentence):
            continue
        if NEGATION.search(sentence):
            continue
        return True
    return False


def optimizer_plan_present(plan: Any) -> bool:
    if plan is None:
        return False
    if hasattr(plan, "model_dump"):
        data = plan.model_dump()
    elif isinstance(plan, dict):
        data = plan
    else:
        return False
    return "can_run" in data and "cannot_run" in data and "solver_status" in data

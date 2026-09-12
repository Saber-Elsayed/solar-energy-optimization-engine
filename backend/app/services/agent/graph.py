"""LangGraph ReAct agent: LLM selects Context, OR-Tools, and RAG tools."""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.prebuilt import create_react_agent

from ...models.agent import AgentContext, AgentRecommendRequest, AgentRecommendResponse
from ...models.optimization import BestCombinationResponse
from .context_tool import gather_agent_context
from .langchain_tools import AgentSession, build_agent_tools
from .llm import get_chat_model

SYSTEM_PROMPT = """You are the Sola Energy Agent, an AI energy-management assistant for solar-powered homes.

Goal: Understand the user's natural-language energy request, retrieve Sola Home documentation when needed, gather live energy context with tools when needed, and provide a safe recommendation for appliance usage.

Backstory: You help homes with solar panels and battery storage use energy efficiently while respecting battery, inverter, appliance, and user-priority constraints.

Tools:
- retrieve_sola_knowledge: Sola Home Markdown knowledge (RAG). Use for project-specific definitions and how this MVP is implemented.
- get_energy_context: live home numbers from the database and weather service.
- run_or_tools_optimization: existing OR-Tools subset selector on live context.

Hard rules:
- NEVER invent battery capacity, SOC, device power, durations, optimizer internals, or optimization results.
- NEVER claim a device can run unless run_or_tools_optimization returned it in can_run.
- If the user asks what can/should run, whether a specific appliance can run, how to prioritize devices, or wants a usage plan: you MUST call run_or_tools_optimization. That tool is the only source of the recommended combination.
- If the user asks what a Sola Home term means, how the optimizer works, whether time windows are enforced, or why batteries/SOC/inverter/available energy matter in this project: you MUST call retrieve_sola_knowledge. Ground the answer in retrieved chunks. Cite source file names (for example battery.md).
- Do not invent implementation details. If retrieval does not contain the answer, say that it is not documented.
- Do not pretend a future feature already exists. Distinguish current MVP behavior from roadmap ideas.
- For conceptual Sola Home questions that are not about THIS home's live plan, do not call get_energy_context or OR-Tools.
- You may call get_energy_context if they ask about THEIR current system numbers.
- For “why can't this appliance run right now?”, use Context + OR-Tools, and RAG if you need documented constraint meanings.
- Clearly distinguish knowledge answers from optimization recommendations.
- After tools run, explain the tool results in plain language. Quote solver_status, can_run, and cannot_run from the optimizer output when a plan was produced.
"""


def _last_ai_text(result: dict) -> str:
    messages = result.get("messages") or []
    for message in reversed(messages):
        if isinstance(message, AIMessage) and isinstance(message.content, str) and message.content.strip():
            return message.content.strip()
    return "I could not produce a recommendation."


def _plan_or_unused(session: AgentSession, context: AgentContext) -> BestCombinationResponse:
    if session.plan is not None:
        return session.plan
    return BestCombinationResponse(
        can_run=[],
        cannot_run=[],
        total_power_w=0.0,
        total_energy_wh=0.0,
        remaining_energy_wh=context.available_energy_wh,
        objective_score=0,
        solver_status="NOT_RUN",
    )


def run_sola_energy_agent(body: AgentRecommendRequest) -> AgentRecommendResponse:
    session = AgentSession(city=body.city)
    tools = build_agent_tools(session)
    graph = create_react_agent(get_chat_model(), tools, prompt=SYSTEM_PROMPT)
    user_text = body.message.strip() or "What can I run right now?"
    result = graph.invoke(
        {"messages": [HumanMessage(content=user_text)]},
        config={"recursion_limit": 20},
    )
    context = session.context if session.context is not None else gather_agent_context(body.city)
    return AgentRecommendResponse(
        message=body.message,
        tools_used=session.tools_used,
        explanation=_last_ai_text(result),
        context=context,
        plan=_plan_or_unused(session, context),
        rag_sources=session.rag_sources,
    )

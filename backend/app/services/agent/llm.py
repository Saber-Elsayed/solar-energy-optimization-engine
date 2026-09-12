"""LLM configuration. Keys come only from environment variables."""

from __future__ import annotations

import os

from langchain_openai import ChatOpenAI

from ...config import load_environment

MISSING_LLM_KEY_ERROR = (
    "OPENAI_API_KEY is not set. Add it to backend/.env to enable the Sola Energy Agent."
)


def get_chat_model() -> ChatOpenAI:
    load_environment()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(MISSING_LLM_KEY_ERROR)

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    kwargs: dict = {
        "model": model,
        "temperature": 0,
        "api_key": api_key,
    }
    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)

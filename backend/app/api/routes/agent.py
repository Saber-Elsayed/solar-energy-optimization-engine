from fastapi import APIRouter, HTTPException
from openai import APIStatusError, AuthenticationError, RateLimitError

from ...models.agent import AgentRecommendRequest, AgentRecommendResponse
from ...services.agent import recommend_energy_plan
from ...services.agent.llm import MISSING_LLM_KEY_ERROR

router = APIRouter(tags=["agent"])


def _openai_error_detail(exc: APIStatusError) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
    return str(exc)


@router.post("/agent/recommend", response_model=AgentRecommendResponse)
def agent_recommend(body: AgentRecommendRequest) -> AgentRecommendResponse:
    """LangGraph Sola Energy Agent: Context, OR-Tools, and RAG knowledge tools."""
    try:
        return recommend_energy_plan(body)
    except RuntimeError as exc:
        detail = str(exc)
        status = 503 if MISSING_LLM_KEY_ERROR in detail else 500
        raise HTTPException(status_code=status, detail=detail) from exc
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=503,
            detail="OpenAI rejected the API key. Check OPENAI_API_KEY in backend/.env.",
        ) from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=503, detail=_openai_error_detail(exc)) from exc
    except APIStatusError as exc:
        raise HTTPException(status_code=502, detail=_openai_error_detail(exc)) from exc

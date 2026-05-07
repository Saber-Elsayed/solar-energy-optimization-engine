from fastapi import APIRouter

from ...models.optimization import MultiScenarioResponse, OptimizeRequest
from ...services.optimization_service import optimize_devices

router = APIRouter()


@router.post("/optimize", response_model=MultiScenarioResponse)
def optimize(body: OptimizeRequest) -> MultiScenarioResponse:
    return optimize_devices(body)


"""HTTP regression for existing MVP endpoints. Does not call the LLM.

Uses FastAPI TestClient against the same app as uvicorn.
Requires MongoDB for /devices, /energy-data/latest, and /solar-system.
"""

from __future__ import annotations

import inspect

from fastapi.testclient import TestClient

from app.api.routes import optimization as optimization_routes
from app.server import app
from app.services.agent.or_tools_tool import run_or_tools_from_context
from app.services.or_tools_optimizer import run_or_tools_best_combination

client = TestClient(app)


def test_get_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_get_devices() -> None:
    response = client.get("/devices")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_energy_latest() -> None:
    response = client.get("/energy-data/latest")
    assert response.status_code in {200, 404}


def test_get_solar_system() -> None:
    response = client.get("/solar-system")
    assert response.status_code in {200, 404}


def test_post_optimize_best_combination() -> None:
    response = client.post(
        "/optimize/best-combination",
        json={"city": "Tel Aviv", "devices": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert "solver_status" in body
    assert "can_run" in body
    assert "cannot_run" in body


def test_or_tools_live_path_still_skips_schedule() -> None:
    assert "apply_schedule=False" in inspect.getsource(run_or_tools_from_context)
    assert "apply_schedule=False" in inspect.getsource(optimization_routes)
    assert inspect.getsource(run_or_tools_best_combination).startswith("def run_or_tools_best_combination")

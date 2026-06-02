"""FastAPI server factory/config (active runtime for the Expo frontend)."""

import logging
from pathlib import Path

# Load .env before any module reads os.getenv (e.g. admin allowlist).
from .config import get_admin_emails, load_environment

load_environment()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import (
    admin_registrations_router,
    auth_router,
    devices_router,
    energy_router,
    firebase_registration_router,
    optimization_router,
    solar_system_router,
    weather_router,
)
from .services.firebase_admin_service import init_firebase_admin

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    init_firebase_admin()
    admin_count = len(get_admin_emails())
    if admin_count == 0:
        logger.warning(
            "FIREBASE_ADMIN_EMAILS is empty. Set it in backend/.env (not only .env.example)."
        )
    else:
        logger.info("Loaded %s admin allowlist email(s) from environment", admin_count)

    app = FastAPI(title="Solar Energy Optimization Engine", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def read_root():
        return {"message": "API is running"}

    app.include_router(auth_router)
    app.include_router(firebase_registration_router)
    app.include_router(admin_registrations_router)
    app.include_router(weather_router)
    app.include_router(energy_router)
    app.include_router(devices_router)
    app.include_router(optimization_router)
    app.include_router(solar_system_router)

    admin_panel_dir = Path(__file__).resolve().parent.parent / "admin_panel"
    if admin_panel_dir.is_dir():
        app.mount("/admin", StaticFiles(directory=str(admin_panel_dir), html=True), name="admin-panel")

    return app


app = create_app()

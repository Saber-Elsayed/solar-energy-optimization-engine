"""FastAPI server factory/config (active runtime for the Expo frontend).

This module owns:
- FastAPI app creation
- middleware setup
- router registration
- startup configuration hooks (future)
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import devices_router, energy_router, optimization_router, weather_router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="Solar Energy Optimization Engine", version="0.1.0")

    # Expo Web (and other browsers) block cross-origin fetch unless the API sends CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def read_root():
        """Root endpoint: confirms the API process is up and responding to HTTP."""
        return {"message": "API is running"}

    # Keep existing endpoint paths by including routers without prefix.
    app.include_router(weather_router)
    app.include_router(energy_router)
    app.include_router(devices_router)
    app.include_router(optimization_router)

    return app


# ASGI app instance (used by uvicorn)
app = create_app()


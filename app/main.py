"""FastAPI application entrypoint.

Responsibility:
- Compose the web application (FastAPI), register routes, and configure
  cross-cutting concerns at the API layer.

Clean Architecture note:
- This module may import from `core/`.
- `core/` must not import from FastAPI (or anything in `app/`).
"""

from fastapi import FastAPI

from app.api.routes import router as api_router


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="Solar Energy Optimization Engine", version="0.1.0")
    app.include_router(api_router)
    return app


app = create_app()


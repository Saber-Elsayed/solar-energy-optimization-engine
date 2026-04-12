"""FastAPI application entrypoint.

This module creates the ASGI application object that Uvicorn runs
(e.g. `uvicorn app.main:app --reload`).
"""

from fastapi import FastAPI

# Instantiate the FastAPI application. This registers the app with Starlette/FastAPI
# and enables automatic OpenAPI schema generation at /docs and /redoc.
app = FastAPI(
    title="Solar Energy Optimization Engine",
    version="0.1.0",
)


@app.get("/")
def read_root():
    """Root endpoint: confirms the API process is up and responding to HTTP."""
    # Return a small JSON payload; FastAPI serializes dicts to JSON automatically.
    return {"message": "API is running"}

from .devices import router as devices_router
from .energy import router as energy_router
from .optimization import router as optimization_router
from .solar_system import router as solar_system_router
from .weather import router as weather_router
from .auth import router as auth_router

__all__ = [
    "devices_router",
    "energy_router",
    "optimization_router",
    "solar_system_router",
    "weather_router",
    "auth_router",
]


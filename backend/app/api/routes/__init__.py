from .devices import router as devices_router
from .energy import router as energy_router
from .optimization import router as optimization_router
from .solar_system import router as solar_system_router
from .weather import router as weather_router
from .admin_registrations import router as admin_registrations_router
from .auth import router as auth_router
from .registration import router as firebase_registration_router

__all__ = [
    "admin_registrations_router",
    "devices_router",
    "energy_router",
    "firebase_registration_router",
    "optimization_router",
    "solar_system_router",
    "weather_router",
    "auth_router",
]


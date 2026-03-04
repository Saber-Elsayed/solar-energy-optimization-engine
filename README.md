# Solar Energy Optimization Engine

A Python service for computing optimal solar generation utilization, battery dispatch, and controllable load scheduling under time-varying electricity prices. Built with **FastAPI** and **Clean Architecture** so that business logic stays independent of the HTTP layer and can be reused across APIs, CLI tools, or batch jobs.

---

## Project Overview

The engine takes as input: a solar production forecast, time-of-use or dynamic pricing, battery state and constraints, and a set of controllable devices (e.g. EV charging, heat pumps). It produces an operational plan—when to charge or discharge the battery and when to run devices—to minimize grid cost or maximize self-consumption, subject to physical and user constraints.

The codebase is structured so that **optimization, forecasting, and risk logic live in a framework-agnostic core**. The FastAPI app is a thin delivery layer that parses requests, calls core use-cases, and returns results. Core has no dependency on FastAPI, which keeps the domain testable and portable.

---

## Problem Statement

Residential and small commercial sites with solar PV and batteries face a non-trivial scheduling problem:

- **Solar production** is intermittent and must be forecast.
- **Battery** capacity, power limits, and efficiency constrain how much energy can be shifted in time.
- **Time-varying tariffs** (import/export) create incentives to charge when prices are low and discharge or self-consume when they are high.
- **Controllable loads** (e.g. deferrable appliances) can be shifted within time windows to align with surplus solar or cheap grid periods.

Solving this well requires: reliable production forecasts, a clear model of constraints and objectives, and a decision layer that can be updated (e.g. new tariffs or devices) without rewriting the entire system. This project provides a structured foundation for that—domain models, optimization entrypoint, forecasting and anomaly-detection hooks—with a REST API for integration and experimentation.

---

## Architecture

The project follows **Clean Architecture** (dependency rule: inner layers do not depend on outer layers).

| Layer | Role |
|-------|------|
| **`app/`** | Delivery: FastAPI app, routes, request/response DTOs. Imports from `core/` only. |
| **`core/`** | Domain and use-cases: models, optimization, forecasting, risk. No FastAPI or HTTP. |
| **`simulation/`** | Utilities for synthetic data and experiments; not part of production decision flow. |

- **Domain models** (`core/models/`) are Pydantic models: `TimeSeries`, `Battery`, `Device`, `Pricing`, etc. They define the vocabulary of the domain and are shared across use-cases.
- **Use-cases** live in `core/`: e.g. `Optimizer.optimize()` consumes forecasts, pricing, battery and devices and returns an `OptimizationResult`. Forecasting and anomaly detection are separate modules with clear interfaces.
- **API** (`app/api/routes.py`) validates incoming payloads, maps them to core types, calls the optimizer (or other use-cases), and returns structured responses. Business rules stay in `core/`.

This keeps the engine suitable for a technical portfolio: the design is explicit, testable, and easy to extend (e.g. add a new solver or data source in `core/` without touching the web layer).

---

## Project Structure

```
solar-energy-optimization-engine/
├── app/
│   ├── main.py              # FastAPI app factory and wiring
│   └── api/
│       └── routes.py         # HTTP endpoints (e.g. POST /api/optimize)
├── core/
│   ├── models/               # Pydantic domain models
│   │   ├── energy.py         # TimeSeries, TimePoint
│   │   ├── battery.py        # Battery state and limits
│   │   ├── device.py         # Controllable loads and windows
│   │   └── pricing.py        # Import/export price signals
│   ├── optimization/
│   │   └── optimizer.py      # Optimization use-case (skeleton)
│   ├── forecasting/
│   │   └── production_forecaster.py  # Solar production forecast (skeleton)
│   └── risk/
│       └── anomaly_detector.py      # Time-series anomaly detection (skeleton)
├── simulation/
│   └── data_generator.py    # Synthetic time-series generation
├── tests/
├── requirements.txt
└── README.md
```

---

## Installation

**Requirements:** Python 3.9+.

1. **Clone the repository**

   ```bash
   git clone https://github.com/<your-username>/solar-energy-optimization-engine.git
   cd solar-energy-optimization-engine
   ```

2. **Create and activate a virtual environment**

   ```bash
   # Windows
   python -m venv .venv
   .venv\Scripts\activate

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Run the API**

   ```bash
   uvicorn app.main:app --reload
   ```

   Interactive API docs: **http://127.0.0.1:8000/docs**

---

## Roadmap

- [ ] **Optimization engine**: Implement a concrete solver (e.g. linear program or rule-based dispatcher) inside `Optimizer` using `core/models` and return structured charge/discharge and device schedules.
- [ ] **Forecasting pipeline**: Connect `ProductionForecaster` to a simple model or external API (e.g. weather + irradiance) and output `TimeSeries` for the optimizer.
- [ ] **Anomaly detection**: Use `AnomalyDetector` to flag bad or missing production/consumption data and optionally gate or adjust optimization inputs.
- [ ] **Simulation and backtesting**: Extend `simulation/data_generator.py` and add tests that run the optimizer over synthetic scenarios to validate cost and constraint handling.
- [ ] **Configuration and deployment**: Externalize config (e.g. solver params, horizons), add health/readiness endpoints, and document deployment (e.g. Docker, cloud).

---

## Technologies Used

| Technology | Role |
|------------|------|
| **Python 3.9+** | Runtime and type hints for domain and API code. |
| **FastAPI** | HTTP API: OpenAPI docs, validation, async support. Kept in `app/` only. |
| **Pydantic** | Domain and request/response models; validation and serialization. |
| **Uvicorn** | ASGI server for running the FastAPI application. |
| **NumPy / Pandas** | Intended for numerical and time-series work in optimization and forecasting (skeletons in place). |

---

## License

See repository license file.

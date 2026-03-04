# Solar Energy Optimization Engine

Clean Architecture Python project skeleton for optimizing solar production, battery usage, and device scheduling.

## Goals

- **Clean Architecture**: `core/` contains business/domain logic and has **no dependency on FastAPI**.
- **FastAPI API layer**: `app/` provides HTTP endpoints and depends on `core/`.
- **Pydantic domain models**: domain entities and value objects live in `core/models/`.

## Structure

```
app/
  main.py
  api/
    routes.py

core/
  models/
    energy.py
    battery.py
    device.py
    pricing.py
  optimization/
    optimizer.py
  forecasting/
    production_forecaster.py
  risk/
    anomaly_detector.py

simulation/
  data_generator.py

tests/
```

## Run (development)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open `http://127.0.0.1:8000/docs`.
from __future__ import annotations

from datetime import date
from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .domain import Dataset, FIRST, LAST, cutoff_time

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("DATA_DIRECTORY", str(ROOT/"data")))
app = FastAPI(title="Ventus Wind Analytics", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
log = logging.getLogger("ventus")


@lru_cache(maxsize=1)
def load() -> tuple[Dataset, dict]:
    try:
        manifest = json.loads((DATA/"manifest.json").read_text())
        raw = (DATA/"snapshot.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
            raise ValueError("Snapshot checksum mismatch")
        snapshot = json.loads(raw)
        return Dataset(snapshot["forecasts"], snapshot["actuals"]), manifest
    except (OSError, ValueError, KeyError, TypeError) as exc:
        log.error("Dataset unavailable: %s", exc)
        raise HTTPException(503, "Validated dataset unavailable. Run python scripts/ingest.py and restart the server.") from exc


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(ValueError)
async def value_error(request: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/metadata")
def metadata():
    dataset, manifest = load()
    return {"ready": True, "manifest": manifest, "timezone": "Europe/London", "units": "MW",
            "decisionFrom": str(FIRST), "decisionTo": str(LAST), "defaultCutoff": "10:00",
            "cutoffIsAssumption": True, "duplicatesRemoved": dataset.duplicates,
            "methodology": "Hourly WINDFOR against the mean of both FUELHH half-hours. Latest publication at or before the decision cutoff; error = forecast minus actual."}


@app.get("/api/decision-day")
def decision_day(date: date, cutoff: str = Query("10:00", pattern=r"^\d{2}:\d{2}$")):
    cutoff_time(cutoff)
    return load()[0].day(date, cutoff)


@app.get("/api/accuracy")
def accuracy(from_date: date = Query(FIRST, alias="from"), to_date: date = Query(LAST, alias="to"),
             cutoff: str = Query("10:00", pattern=r"^\d{2}:\d{2}$")):
    cutoff_time(cutoff)
    return load()[0].accuracy(from_date, to_date, cutoff)


dist = ROOT/"dist"
if (dist/"assets").is_dir():
    app.mount("/assets", StaticFiles(directory=dist/"assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "API route not found")
    if (dist/"index.html").is_file():
        return FileResponse(dist/"index.html")
    raise HTTPException(404, "Frontend not built. Run npm run build, or use the Vite development server.")

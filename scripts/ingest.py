"""Reproducible Elexon extraction. Standard library only; never fabricates values."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.domain import Dataset, FIRST, LAST

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets/"


def fetch(dataset: str, params: dict, raw: Path, refresh: bool = False) -> tuple[list, dict]:
    if dataset == "FUELHH" and any(k.startswith("settlementDate") for k in params) and any(k.startswith("publishDate") for k in params):
        raise ValueError("Settlement and publication filters cannot be combined")
    query = urllib.parse.urlencode(params)
    url = BASE+dataset+"/stream?"+query
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    cached = raw/f"{dataset}-{key}.json"
    metadata = cached.with_suffix(".meta.json")
    if cached.exists() and metadata.exists() and not refresh:
        payload = cached.read_bytes()
        info = json.loads(metadata.read_text())
    else:
        for attempt in range(4):
            try:
                request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "VentusAssignment/1.0"})
                with urllib.request.urlopen(request, timeout=60) as response:
                    payload = response.read()
                break
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise RuntimeError(f"Elexon {dataset}: HTTP {exc.code}: {exc.read(1500).decode(errors='replace')}") from exc
                retry = exc.headers.get("Retry-After", "")
                time.sleep(min(float(retry), 30) if retry.isdigit() else 2**attempt)
            except (urllib.error.URLError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        info = {"url": url, "extractedAt": datetime.now(timezone.utc).isoformat(),
                "sha256": hashlib.sha256(payload).hexdigest()}
        cached.write_bytes(payload)
        metadata.write_text(json.dumps(info, indent=2))
    if hashlib.sha256(payload).hexdigest() != info["sha256"]:
        raise ValueError(f"Raw cache checksum mismatch: {cached.name}")
    result = json.loads(payload)
    if not isinstance(result, list):
        raise ValueError(f"Expected JSON array from {dataset}")
    return result, {**info, "rows": len(result)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    raw = ROOT/"data"/"raw"
    raw.mkdir(parents=True, exist_ok=True)
    jobs = []
    # Three preceding days cover the observed two-day forecast horizon with overlap.
    # Coverage is checked explicitly below; unavailable periods are never filled.
    for i in range(34):
        start = date(2025, 12, 29)+timedelta(days=i)
        end = start+timedelta(days=1)
        jobs.append(("WINDFOR", {"publishDateTimeFrom": f"{start}T00:00:00Z", "publishDateTimeTo": f"{end}T00:00:00Z"}))
    for i in range(31):
        day = date(2026, 1, 2)+timedelta(days=i)
        jobs.append(("FUELHH", {"settlementDateFrom": str(day), "settlementDateTo": str(day), "fuelType": "WIND"}))
    collected = {"WINDFOR": [], "FUELHH": []}
    requests = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch, kind, params, raw, args.refresh): kind for kind, params in jobs}
        for done, future in enumerate(as_completed(futures), 1):
            rows, info = future.result()
            collected[futures[future]].extend(rows)
            requests.append(info)
            print(f"{done}/{len(jobs)} {futures[future]} {len(rows)} rows", flush=True)
    start, end = "2026-01-02T00:00:00Z", "2026-02-02T00:00:00Z"
    forecasts = [r for r in collected["WINDFOR"] if start <= r["startTime"] < end]
    actuals = [r for r in collected["FUELHH"] if start <= r["startTime"] < end and r["fuelType"] == "WIND"]
    # Preserve conflicts for Dataset validation, deduplicate only identical payloads.
    forecasts = list({json.dumps(r, sort_keys=True): r for r in forecasts}.values())
    actuals = list({json.dumps(r, sort_keys=True): r for r in actuals}.values())
    forecasts.sort(key=lambda r: (r["startTime"], r["publishTime"]))
    actuals.sort(key=lambda r: (r["startTime"], r["publishTime"]))
    dataset = Dataset(forecasts, actuals)
    coverage = dataset.accuracy(FIRST, LAST, "10:00")
    payload = json.dumps({"forecasts": forecasts, "actuals": actuals}, separators=(",", ":")).encode()
    manifest = {
        "schemaVersion": 1, "source": "Elexon Insights / BMRS", "synthetic": False,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "extractedFrom": min(r["extractedAt"] for r in requests),
        "extractedTo": max(r["extractedAt"] for r in requests),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "forecastRows": len(forecasts), "actualRows": len(actuals),
        "decisionFrom": str(FIRST), "decisionTo": str(LAST),
        "deliveryFrom": "2026-01-02", "deliveryTo": "2026-02-01",
        "forecastResolutionMinutes": 60, "actualResolutionMinutes": 30,
        "comparisonResolutionMinutes": 60, "units": "MW",
        "defaultCutoff": "10:00", "cutoffIsAssumption": True,
        "defaultCutoffValidation": coverage["metrics"],
        "requests": sorted(requests, key=lambda r: r["url"]),
    }
    path = ROOT/"data"
    (path/"snapshot.next.json").write_bytes(payload)
    (path/"manifest.next.json").write_text(json.dumps(manifest, indent=2))
    (path/"snapshot.next.json").replace(path/"snapshot.json")
    (path/"manifest.next.json").replace(path/"manifest.json")
    print(json.dumps({"forecastRows": len(forecasts), "actualRows": len(actuals), "validation": coverage["metrics"]}, indent=2))


if __name__ == "__main__":
    main()

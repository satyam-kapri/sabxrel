"""Pure temporal selection and analytics. No network or framework dependencies."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from math import isfinite, sqrt
from zoneinfo import ZoneInfo

UTC = timezone.utc
UK = ZoneInfo("Europe/London")
FIRST = date(2026, 1, 1)
LAST = date(2026, 1, 31)


def timestamp(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamps must include a timezone")
    return result.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def cutoff_time(value: str) -> time:
    if len(value) != 5 or value[2] != ":":
        raise ValueError("Cutoff must use HH:MM format")
    parsed = time.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise ValueError("Cutoff is expressed in UK local time")
    return parsed


def validate_date(value: date) -> date:
    if not FIRST <= value <= LAST:
        raise ValueError("Decision date must be between 2026-01-01 and 2026-01-31")
    return value


def delivery_grid(decision: date) -> list[datetime]:
    delivery = decision + timedelta(days=1)
    start = datetime.combine(delivery, time(), UK).astimezone(UTC)
    end = datetime.combine(delivery + timedelta(days=1), time(), UK).astimezone(UTC)
    return [start + timedelta(hours=i) for i in range(int((end-start).total_seconds()/3600))]


def metrics(rows: list[dict]) -> dict:
    errors = [r["error"] for r in rows if r["error"] is not None]
    return {
        "mae": sum(abs(e) for e in errors)/len(errors) if errors else None,
        "rmse": sqrt(sum(e*e for e in errors)/len(errors)) if errors else None,
        "bias": sum(errors)/len(errors) if errors else None,
        "matched": len(errors), "expected": len(rows),
        "coverage": len(errors)/len(rows) if rows else 0,
        "missingForecast": sum(r["forecast"] is None for r in rows),
        "missingActual": sum(r["actual"] is None for r in rows),
    }


class Dataset:
    def __init__(self, forecasts: list[dict], actuals: list[dict]):
        self.forecasts: dict[datetime, list[tuple[datetime, float]]] = defaultdict(list)
        self.actuals: dict[datetime, tuple[datetime, float]] = {}
        self.duplicates = 0
        seen = {}
        for row in forecasts:
            if row.get("dataset") != "WINDFOR":
                raise ValueError("Unexpected forecast dataset")
            target, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
            generation = self.number(row["generation"])
            if target.minute or target.second or target.microsecond:
                raise ValueError("Forecast targets must align to whole hours")
            key = (target, published)
            if key in seen:
                if seen[key] != generation:
                    raise ValueError("Conflicting forecast rows for the same target and publication")
                self.duplicates += 1
                continue
            seen[key] = generation
            self.forecasts[target].append((published, generation))
        for values in self.forecasts.values():
            values.sort()
        actual_seen = {}
        for row in actuals:
            if row.get("fuelType") != "WIND":
                continue
            if row.get("dataset") != "FUELHH":
                raise ValueError("Unexpected actual dataset")
            target, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
            generation = self.number(row["generation"])
            local = target.astimezone(UK)
            if local.minute not in (0, 30) or local.second or local.microsecond:
                raise ValueError("Actual targets must align to half hours")
            if "settlementDate" in row and row["settlementDate"] != local.date().isoformat():
                raise ValueError("Settlement date disagrees with startTime")
            if "settlementPeriod" in row:
                midnight = datetime.combine(local.date(), time(), UK).astimezone(UTC)
                period = int((target-midnight).total_seconds()/1800)+1
                if row["settlementPeriod"] != period:
                    raise ValueError("Settlement period disagrees with startTime")
            key = (target, published)
            if key in actual_seen and actual_seen[key] != generation:
                raise ValueError("Conflicting actual rows for the same target and publication")
            if key in actual_seen:
                self.duplicates += 1
            actual_seen[key] = generation
            if target not in self.actuals or published > self.actuals[target][0]:
                self.actuals[target] = (published, generation)

    @staticmethod
    def number(value) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
            raise ValueError("Generation must be a finite, non-negative number in MW")
        return float(value)

    def day(self, decision: date, cutoff: str) -> dict:
        validate_date(decision)
        cutoff_at = datetime.combine(decision, cutoff_time(cutoff), UK).astimezone(UTC)
        rows = []
        for target in delivery_grid(decision):
            eligible = [x for x in self.forecasts.get(target, []) if x[0] <= cutoff_at]
            selected = eligible[-1] if eligible else None
            halves = [self.actuals.get(target), self.actuals.get(target+timedelta(minutes=30))]
            actual = sum(x[1] for x in halves)/2 if all(x is not None for x in halves) else None
            forecast = selected[1] if selected else None
            rows.append({
                "startTime": iso(target), "hour": target.astimezone(UK).strftime("%H:%M"),
                "forecast": forecast, "actual": actual,
                "error": forecast-actual if forecast is not None and actual is not None else None,
                "publishTime": iso(selected[0]) if selected else None,
                "leadHours": (target-selected[0]).total_seconds()/3600 if selected else None,
                "actualHalfHours": sum(x is not None for x in halves),
            })
        forecasts = [r["forecast"] for r in rows if r["forecast"] is not None]
        publications = sorted({r["publishTime"] for r in rows if r["publishTime"]})
        return {
            "decisionDate": decision.isoformat(), "deliveryDate": (decision+timedelta(days=1)).isoformat(),
            "cutoff": cutoff, "cutoffAt": iso(cutoff_at), "rows": rows, "metrics": metrics(rows),
            "averageForecast": sum(forecasts)/len(forecasts) if forecasts else None,
            "peakForecast": max(forecasts) if forecasts else None,
            "publications": publications,
        }

    def accuracy(self, first: date, last: date, cutoff: str) -> dict:
        validate_date(first)
        validate_date(last)
        if first > last:
            raise ValueError("Start date must be on or before end date")
        days = [self.day(first+timedelta(days=i), cutoff) for i in range((last-first).days+1)]
        rows = [r for day in days for r in day["rows"]]
        return {
            "from": first.isoformat(), "to": last.isoformat(), "cutoff": cutoff,
            "metrics": metrics(rows),
            "days": [{"decisionDate": d["decisionDate"], "deliveryDate": d["deliveryDate"],
                      "averageForecast": d["averageForecast"], **d["metrics"]} for d in days],
        }

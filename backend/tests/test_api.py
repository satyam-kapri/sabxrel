from datetime import date
import json

from fastapi.testclient import TestClient
import pytest

from backend.app import main

client = TestClient(main.app)


def test_health_and_metadata():
    assert client.get("/api/health").json()["status"] == "ok"
    meta = client.get("/api/metadata").json()
    assert meta["manifest"]["synthetic"] is False
    assert meta["manifest"]["forecastRows"] > 1000
    assert meta["units"] == "MW"


def test_real_january_cohort_no_future_publications_and_full_default_coverage():
    result = client.get("/api/accuracy?from=2026-01-01&to=2026-01-31&cutoff=10:00")
    assert result.status_code == 200
    body = result.json()
    assert body["metrics"]["matched"] == 744
    dataset, _ = main.load()
    for d in range(1, 32):
        day = dataset.day(date(2026, 1, d), "10:00")
        assert all(row["publishTime"] <= day["cutoffAt"] for row in day["rows"])


def test_first_day_values_independently_from_raw_published_sample():
    # Jan 1 09:30 forecast for Jan 2 00:00 was 18,699 MW.
    # Actual 00:00=15,228 and 00:30=15,505 => mean=15,366.5.
    body = client.get("/api/decision-day?date=2026-01-01&cutoff=10:00").json()
    first = body["rows"][0]
    assert first["forecast"] == 18699
    assert first["actual"] == 15366.5
    assert first["error"] == 3332.5
    assert first["publishTime"] == "2026-01-01T09:30:00Z"


@pytest.mark.parametrize("path", [
    "/api/decision-day?date=2026-02-01", "/api/decision-day?date=not-a-date",
    "/api/decision-day?date=2026-01-01&cutoff=25:00",
    "/api/decision-day?date=2026-01-01&cutoff=10:00:00",
    "/api/accuracy?from=2026-01-10&to=2026-01-01",
])
def test_invalid_parameters(path):
    assert client.get(path).status_code == 422


def test_api_404_not_spa_html():
    assert client.get("/api/nonexistent").status_code == 404


def test_public_font_is_served_as_a_file_instead_of_spa_html(tmp_path, monkeypatch):
    (tmp_path/"fonts").mkdir()
    (tmp_path/"fonts"/"test.ttf").write_bytes(b"font-bytes")
    (tmp_path/"index.html").write_text("<html>SPA</html>")
    monkeypatch.setattr(main, "dist", tmp_path)
    response = client.get("/fonts/test.ttf")
    assert response.status_code == 200
    assert response.content == b"font-bytes"
    assert "text/html" not in response.headers["content-type"]


def test_explicit_forecast_date_is_respected_by_api():
    response = client.get("/api/decision-day?date=2026-01-14&cutoff=10:00&forecastDate=2026-01-13")
    assert response.status_code == 200
    body = response.json()
    assert body["deliveryDate"] == "2026-01-15"
    assert body["forecastDate"] == "2026-01-13"
    assert body["cutoffAt"] == "2026-01-13T10:00:00Z"
    assert all(row["publishTime"] <= body["cutoffAt"] for row in body["rows"] if row["publishTime"])
    assert body["rows"] != client.get("/api/decision-day?date=2026-01-14&cutoff=10:00").json()["rows"]


@pytest.mark.parametrize("query", ["forecastDate=2026-01-15", "forecastDate=not-a-date"])
def test_invalid_forecast_date(query):
    assert client.get("/api/decision-day?date=2026-01-14&"+query).status_code == 422


def test_accuracy_accepts_older_forecast_policy_and_rejects_invalid_lead():
    response = client.get("/api/accuracy?from=2026-01-01&to=2026-01-02&leadDays=2")
    assert response.status_code == 200
    assert [day["forecastDate"] for day in response.json()["days"]] == ["2025-12-31", "2026-01-01"]
    assert client.get("/api/accuracy?leadDays=0").status_code == 422
    assert client.get("/api/accuracy?leadDays=3661").status_code == 422


def test_snapshot_checksum_and_unavailable_state(tmp_path, monkeypatch):
    original_data = main.DATA
    manifest = json.loads((original_data/"manifest.json").read_text())
    (tmp_path/"manifest.json").write_text(json.dumps(manifest))
    (tmp_path/"snapshot.json").write_text('{"forecasts": [], "actuals": []}')
    main.load.cache_clear()
    monkeypatch.setattr(main, "DATA", tmp_path)
    try:
        response = client.get("/api/metadata")
        assert response.status_code == 503
        assert "unavailable" in response.json()["detail"]
        assert client.get("/api/health").status_code == 200
    finally:
        main.load.cache_clear()

from datetime import date
from math import sqrt

import pytest

from backend.app.domain import Dataset, cutoff_time, delivery_grid, metrics, timestamp


def forecast(value=100, published="2026-01-01T09:30:00Z", target="2026-01-02T00:00:00Z"):
    return {"dataset": "WINDFOR", "generation": value, "publishTime": published, "startTime": target}


def actual(value=60, target="2026-01-02T00:00:00Z", published="2026-01-02T01:00:00Z", fuel="WIND"):
    return {"dataset": "FUELHH", "generation": value, "publishTime": published, "startTime": target, "fuelType": fuel}


def halves():
    return [actual(60), actual(80, "2026-01-02T00:30:00Z")]


def test_latest_eligible_and_exact_cutoff_excludes_future():
    d = Dataset([forecast(90), forecast(100, "2026-01-01T10:00:00Z"), forecast(500, "2026-01-01T10:00:01Z")], halves())
    row = d.day(date(2026, 1, 1), "10:00")["rows"][0]
    assert row["forecast"] == 100
    assert row["actual"] == 70
    assert row["error"] == 30
    assert row["publishTime"] == "2026-01-01T10:00:00Z"
    assert row["leadHours"] == 14
    assert d.day(date(2026, 1, 1), "09:45")["rows"][0]["forecast"] == 90


def test_missing_eligible_forecast_is_not_filled_from_future():
    day = Dataset([forecast()], halves()).day(date(2026, 1, 1), "08:00")
    assert day["rows"][0]["forecast"] is None
    assert day["metrics"]["matched"] == 0
    assert day["metrics"]["mae"] is None


def test_missing_half_hour_invalidates_hour_instead_of_zero_filling():
    row = Dataset([forecast()], [actual()]).day(date(2026, 1, 1), "10:00")["rows"][0]
    assert row["actual"] is None
    assert row["error"] is None
    assert row["actualHalfHours"] == 1


def test_zero_actual_is_a_valid_matched_pair():
    day = Dataset([forecast()], [actual(0), actual(0, "2026-01-02T00:30:00Z")]).day(date(2026, 1, 1), "10:00")
    assert day["rows"][0]["error"] == 100
    assert day["metrics"]["matched"] == 1
    assert day["metrics"]["coverage"] == 1/24


def test_actual_revision_and_non_wind_filter():
    d = Dataset([forecast()], halves()+[actual(200, published="2026-01-03T00:00:00Z"), actual(999, fuel="NUCLEAR")])
    assert d.day(date(2026, 1, 1), "10:00")["rows"][0]["actual"] == 140


def test_duplicate_and_conflict_rules():
    assert Dataset([forecast(), forecast()], []).duplicates == 1
    with pytest.raises(ValueError, match="Conflicting forecast"):
        Dataset([forecast(10), forecast(20)], [])
    with pytest.raises(ValueError, match="Conflicting actual"):
        Dataset([], [actual(10), actual(20)])


@pytest.mark.parametrize("value", [float("nan"), float("inf"), None, -1, True, "100"])
def test_generation_validation(value):
    with pytest.raises(ValueError):
        Dataset([forecast(value)], [])


def test_metrics_independent_hand_calculation():
    result = metrics([{"error": -3, "forecast": 7, "actual": 10}, {"error": 4, "forecast": 14, "actual": 10}, {"error": None, "forecast": None, "actual": 10}])
    assert result["mae"] == 3.5
    assert result["rmse"] == sqrt(12.5)
    assert result["bias"] == .5
    assert result["coverage"] == 2/3
    assert result["missingForecast"] == 1


def test_month_cohort_and_february_boundary():
    assert delivery_grid(date(2026, 1, 31))[0].isoformat() == "2026-02-01T00:00:00+00:00"
    result = Dataset([], []).accuracy(date(2026, 1, 1), date(2026, 1, 31), "10:00")
    assert result["metrics"]["expected"] == 744
    assert len(result["days"]) == 31
    assert result["metrics"]["rmse"] is None


def test_uk_dst_grid_does_not_hardcode_24_hours():
    assert len(delivery_grid(date(2026, 3, 28))) == 23
    assert len(delivery_grid(date(2026, 10, 24))) == 25


@pytest.mark.parametrize("value", ["25:00", "1:00", "10:99", "10:00:00", ""])
def test_invalid_cutoff(value):
    with pytest.raises(ValueError):
        cutoff_time(value)


def test_unsupported_date_and_reverse_range():
    d = Dataset([], [])
    with pytest.raises(ValueError):
        d.day(date(2026, 2, 1), "10:00")
    with pytest.raises(ValueError):
        d.accuracy(date(2026, 1, 2), date(2026, 1, 1), "10:00")


def test_naive_timestamp_and_wrong_dataset_and_alignment():
    with pytest.raises(ValueError):
        timestamp("2026-01-01T00:00:00")
    with pytest.raises(ValueError, match="whole hours"):
        Dataset([forecast(target="2026-01-02T00:30:00Z")], [])
    with pytest.raises(ValueError, match="Unexpected forecast dataset"):
        Dataset([{**forecast(), "dataset": "OTHER"}], [])
    with pytest.raises(ValueError, match="Settlement period"):
        Dataset([], [{**actual(), "settlementDate": "2026-01-02", "settlementPeriod": 2}])


def test_cohort_rmse_is_computed_across_pairs_not_mean_of_daily_rmse():
    fs = [forecast(100), forecast(110, "2026-01-02T09:30:00Z", "2026-01-03T00:00:00Z")]
    acts = [actual(100), actual(100, "2026-01-02T00:30:00Z"), actual(100, "2026-01-03T00:00:00Z"), actual(100, "2026-01-03T00:30:00Z")]
    result = Dataset(fs, acts).accuracy(date(2026, 1, 1), date(2026, 1, 2), "10:00")
    assert result["metrics"]["rmse"] == pytest.approx(sqrt(50))
    assert result["metrics"]["rmse"] != 5


def test_explicit_past_forecast_date_uses_older_publications_for_same_generation_day():
    dataset = Dataset([forecast(40, "2025-12-31T09:30:00Z"), forecast(100)], halves())
    result = dataset.day(date(2026, 1, 1), "10:00", date(2025, 12, 31))
    assert result["deliveryDate"] == "2026-01-02"
    assert result["decisionDate"] == "2026-01-01"
    assert result["forecastDate"] == "2025-12-31"
    assert result["cutoffAt"] == "2025-12-31T10:00:00Z"
    assert result["rows"][0]["forecast"] == 40
    assert result["rows"][0]["actual"] == 70
    assert result["rows"][0]["error"] == -30


def test_forecast_date_cannot_cross_into_generation_day():
    with pytest.raises(ValueError, match="before the generation day"):
        Dataset([], []).day(date(2026, 1, 1), "10:00", date(2026, 1, 2))


def test_cohort_lead_days_apply_consistently_and_do_not_fill_missing_forecasts():
    dataset = Dataset([forecast(40, "2025-12-31T09:30:00Z"), forecast(100)], halves())
    result = dataset.accuracy(date(2026, 1, 1), date(2026, 1, 2), "10:00", 2)
    assert result["leadDays"] == 2
    assert [d["forecastDate"] for d in result["days"]] == ["2025-12-31", "2026-01-01"]
    assert result["metrics"]["mae"] == 30
    assert result["metrics"]["matched"] == 1
    assert result["metrics"]["expected"] == 48

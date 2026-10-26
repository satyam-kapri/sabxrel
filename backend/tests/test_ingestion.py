import json
import urllib.error
from unittest.mock import patch

import pytest

from scripts.ingest import fetch


def test_settlement_and_publication_combination_rejected_before_network(tmp_path):
    with pytest.raises(ValueError, match="cannot be combined"):
        fetch("FUELHH", {"settlementDateFrom": "2026-01-02", "publishDateTimeFrom": "2026-01-01T00:00:00Z"}, tmp_path)


def test_json_array_contract_and_raw_cache(tmp_path):
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return b'[{"dataset":"WINDFOR"}]'
    with patch("urllib.request.urlopen", return_value=Response()) as mocked:
        params = {"publishDateTimeFrom": "2026-01-01T00:00:00Z"}
        rows, manifest = fetch("WINDFOR", params, tmp_path)
        assert rows == [{"dataset": "WINDFOR"}]
        request = mocked.call_args.args[0]
        assert request.get_header("Accept") == "application/json"
        assert "publishDateTimeFrom=" in request.full_url
        fetch("WINDFOR", params, tmp_path)
        assert mocked.call_count == 1
        assert len(manifest["sha256"]) == 64


def test_bad_request_not_retried(tmp_path):
    from io import BytesIO
    error = urllib.error.HTTPError("https://example.invalid", 400, "Bad Request", {}, BytesIO(json.dumps({"errors": {"": ["The Settlement Date fields cannot be set when a Publish Date field is set."]}}).encode()))
    with patch("urllib.request.urlopen", side_effect=error) as mocked:
        with pytest.raises(RuntimeError, match="HTTP 400"):
            fetch("FUELHH", {"settlementDateFrom": "2026-01-02"}, tmp_path)
        assert mocked.call_count == 1

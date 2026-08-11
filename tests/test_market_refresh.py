"""Tests for the fail-closed daily market refresh runner."""
from __future__ import annotations

import json
import io
import urllib.error
import urllib.request
from typing import Any

import pytest

from scripts.run_market_refresh import (
    MarketRefreshError,
    _NoRedirectHandler,
    _default_http_post,
    _market_refresh_url,
    _timeout_seconds,
    refresh_market_prices,
)


def _response(*, partial: bool = False) -> dict[str, Any]:
    sources: list[dict[str, Any]] = [
        {
            "source": "Department of Agriculture MIS",
            "status": "succeeded",
            "parsed": 3,
            "inserted": 3,
        },
        {
            "source": "Myanmar Rice Federation",
            "status": "succeeded",
            "parsed": 3,
            "inserted": 3,
        },
        {
            "source": "Central Statistical Organization",
            "status": "succeeded",
            "parsed": 3,
            "inserted": 3,
        },
        {
            "source": "Wisarra",
            "status": "succeeded",
            "parsed": 3,
            "inserted": 3,
        },
    ]
    if partial:
        sources[1] = {
            "source": "Myanmar Rice Federation",
            "status": "failed",
            "parsed": 0,
            "inserted": 0,
            "error": "SOURCE_UNAVAILABLE",
        }
    return {
        "status": "partially_succeeded" if partial else "succeeded",
        "inserted": sum(source["inserted"] for source in sources),
        "coverage": {
            "total_crops": 17,
            "current_crops": [
                "monsoon_rice",
                "dry_season_rice",
                "black_gram",
                "green_gram",
                "maize",
                "groundnut",
                "chili",
                "sesame",
                "tomato",
                "pigeon_pea",
            ],
            "stale_crops": [],
            "missing_crops": [
                "sugarcane",
                "cassava",
                "rubber",
                "mango",
                "durian",
                "mangosteen",
                "longan",
            ],
        },
        "sources": sources,
    }


def test_refresh_uses_authenticated_internal_endpoint_and_validates_success() -> None:
    captured: dict[str, Any] = {}

    def fake_post(url: str, headers: dict[str, str], timeout: float) -> bytes:
        captured.update(url=url, headers=headers, timeout=timeout)
        return json.dumps(_response()).encode()

    result = refresh_market_prices(
        backend_url="https://backend.example",
        internal_api_key="internal-secret-value",
        timeout_seconds=175,
        http_post=fake_post,
    )

    assert result["status"] == "succeeded"
    assert captured["url"] == (
        "https://backend.example/api/v1/internal/market-prices/refresh"
    )
    assert captured["headers"]["X-Internal-API-Key"] == "internal-secret-value"
    assert captured["timeout"] == 175


def test_refresh_accepts_truthful_partial_result_for_scheduler_alerting() -> None:
    result = refresh_market_prices(
        backend_url="http://127.0.0.1:8000",
        internal_api_key="internal-secret-value",
        http_post=lambda *_args: json.dumps(_response(partial=True)).encode(),
    )
    assert result["status"] == "partially_succeeded"


def test_refresh_rejects_plain_http_for_non_loopback_without_explicit_opt_in() -> None:
    with pytest.raises(MarketRefreshError, match="must use HTTPS"):
        _market_refresh_url("http://backend.internal:8000")
    assert _market_refresh_url(
        "http://backend.internal:8000",
        allow_insecure_http=True,
    ).endswith("/api/v1/internal/market-prices/refresh")


def test_refresh_never_follows_redirects_with_the_internal_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    class RedirectingOpener:
        def open(self, request: urllib.request.Request, timeout: float) -> Any:
            captured.update(request=request, timeout=timeout)
            raise urllib.error.HTTPError(
                request.full_url,
                302,
                "Found",
                {"Location": "https://other.example/target"},
                io.BytesIO(b"redirect refused"),
            )

    def fake_build_opener(*handlers: Any) -> RedirectingOpener:
        captured["handlers"] = handlers
        return RedirectingOpener()

    monkeypatch.setattr(urllib.request, "build_opener", fake_build_opener)
    with pytest.raises(MarketRefreshError, match=r"rejected market refresh \(302\)"):
        _default_http_post(
            "https://backend.example/refresh",
            {"X-Internal-API-Key": "must-not-be-forwarded"},
            2,
        )
    handler = captured["handlers"][0]
    assert isinstance(handler, _NoRedirectHandler)
    assert handler.redirect_request(
        captured["request"],
        None,
        302,
        "Found",
        {},
        "https://other.example/target",
    ) is None


@pytest.mark.parametrize(
    "origin",
    [
        "backend.example",
        "ftp://backend.example",
        "https://user:password@backend.example",
        "https://backend.example/path",
        "https://backend.example?key=value",
        "https://backend.example#fragment",
        "https://[invalid",
    ],
)
def test_refresh_rejects_unsafe_backend_origins(origin: str) -> None:
    with pytest.raises(MarketRefreshError, match="BACKEND_URL"):
        _market_refresh_url(origin)


@pytest.mark.parametrize("value", ["zero", "0", "-1", "nan", "601"])
def test_refresh_rejects_invalid_timeout(value: str) -> None:
    with pytest.raises(MarketRefreshError, match="TIMEOUT"):
        _timeout_seconds(value)


def test_refresh_requires_internal_key_before_network_call() -> None:
    with pytest.raises(MarketRefreshError, match="INTERNAL_API_KEY"):
        refresh_market_prices(
            internal_api_key="",
            http_post=lambda *_args: pytest.fail("network call should not occur"),
        )


def test_refresh_normalizes_outer_whitespace_in_internal_key() -> None:
    captured: dict[str, Any] = {}

    def fake_post(_url: str, headers: dict[str, str], _timeout: float) -> bytes:
        captured.update(headers)
        return json.dumps(_response()).encode()

    refresh_market_prices(
        internal_api_key="  internal-secret-value  ",
        http_post=fake_post,
    )
    assert captured["X-Internal-API-Key"] == "internal-secret-value"


@pytest.mark.parametrize("value", ["secret\nvalue", "secret\rvalue", "secret\x00value"])
def test_refresh_rejects_control_characters_in_internal_key(value: str) -> None:
    with pytest.raises(MarketRefreshError, match="control characters"):
        refresh_market_prices(
            internal_api_key=value,
            http_post=lambda *_args: pytest.fail("network call should not occur"),
        )


def test_refresh_rejects_non_ascii_internal_key() -> None:
    with pytest.raises(MarketRefreshError, match="ASCII"):
        refresh_market_prices(
            internal_api_key="secret-🔑",
            http_post=lambda *_args: pytest.fail("network call should not occur"),
        )


def test_default_http_post_wraps_invalid_request_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject_request(*_args: Any, **_kwargs: Any) -> Any:
        raise ValueError("invalid header value")

    monkeypatch.setattr(urllib.request, "Request", reject_request)
    with pytest.raises(MarketRefreshError, match="request was invalid"):
        _default_http_post(
            "https://backend.example/refresh",
            {"X-Internal-API-Key": "secret"},
            2,
        )


@pytest.mark.parametrize(
    "mutation",
    [
        lambda response: response.update(inserted=99),
        lambda response: response.update(status="succeeded")
        or response["sources"].append(
            {
                "source": "DOA",
                "status": "failed",
                "parsed": 0,
                "inserted": 0,
                "error": "SOURCE_UNAVAILABLE",
            }
        ),
        lambda response: response["sources"].append(response["sources"][0].copy()),
        lambda response: response["coverage"].update(total_crops=16),
        lambda response: response["coverage"]["missing_crops"].append("maize"),
        lambda response: response["coverage"]["stale_crops"].append("maize"),
        lambda response: response["sources"].pop(),
    ],
)
def test_refresh_rejects_inconsistent_backend_response(mutation: Any) -> None:
    response = _response()
    mutation(response)
    with pytest.raises(MarketRefreshError, match="inconsistent|duplicate|unexpected"):
        refresh_market_prices(
            internal_api_key="internal-secret-value",
            http_post=lambda *_args: json.dumps(response).encode(),
        )


def test_refresh_rejects_non_json_backend_response() -> None:
    with pytest.raises(MarketRefreshError, match="invalid market refresh JSON"):
        refresh_market_prices(
            internal_api_key="internal-secret-value",
            http_post=lambda *_args: b"not-json",
        )

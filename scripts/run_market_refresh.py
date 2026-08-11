#!/usr/bin/env python3
"""Trigger and validate the authenticated daily market-price refresh."""
from __future__ import annotations

import ipaddress
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable


BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
MARKET_REFRESH_PATH = "/api/v1/internal/market-prices/refresh"
MAX_RESPONSE_BYTES = 256 * 1024
DEFAULT_TIMEOUT_SECONDS = 150.0
EXPECTED_MARKET_SOURCES = {
    "Department of Agriculture MIS",
    "Myanmar Rice Federation",
    "Central Statistical Organization",
    "Wisarra",
}
CANONICAL_CROPS = (
    "monsoon_rice",
    "dry_season_rice",
    "black_gram",
    "green_gram",
    "maize",
    "groundnut",
    "chili",
    "sesame",
    "sugarcane",
    "cassava",
    "tomato",
    "pigeon_pea",
    "rubber",
    "mango",
    "durian",
    "mangosteen",
    "longan",
)

HttpPost = Callable[[str, dict[str, str], float], bytes]


class MarketRefreshError(RuntimeError):
    """Raised when a scheduled market refresh cannot be trusted."""


def _market_refresh_url(origin: str, *, allow_insecure_http: bool = False) -> str:
    try:
        parsed = urllib.parse.urlsplit(origin.strip())
        hostname = parsed.hostname
    except ValueError as exc:
        raise MarketRefreshError(
            "BACKEND_URL must be an HTTP(S) origin without credentials or a path"
        ) from exc
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise MarketRefreshError(
            "BACKEND_URL must be an HTTP(S) origin without credentials or a path"
        )
    if (
        parsed.scheme == "http"
        and not _is_loopback_host(hostname)
        and not allow_insecure_http
    ):
        raise MarketRefreshError(
            "BACKEND_URL must use HTTPS unless insecure HTTP is explicitly enabled"
        )
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, MARKET_REFRESH_PATH, "", "")
    )


def _is_loopback_host(hostname: str | None) -> bool:
    if hostname is None:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _boolean_environment_value(raw_value: str | None, name: str) -> bool:
    normalized = (raw_value or "false").strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise MarketRefreshError(f"{name} must be true or false")


def _timeout_seconds(raw_value: str | None) -> float:
    value = raw_value or str(DEFAULT_TIMEOUT_SECONDS)
    try:
        timeout = float(value)
    except ValueError as exc:
        raise MarketRefreshError(
            "MARKET_REFRESH_REQUEST_TIMEOUT_SECONDS must be numeric"
        ) from exc
    if not math.isfinite(timeout) or timeout <= 0 or timeout > 600:
        raise MarketRefreshError(
            "MARKET_REFRESH_REQUEST_TIMEOUT_SECONDS must be greater than 0 and at most 600"
        )
    return timeout


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _default_http_post(url: str, headers: dict[str, str], timeout: float) -> bytes:
    try:
        request = urllib.request.Request(url, data=b"", headers=headers, method="POST")
        opener = urllib.request.build_opener(_NoRedirectHandler())
        with opener.open(request, timeout=timeout) as response:
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise MarketRefreshError("backend market refresh response is too large")
            return payload
    except ValueError as exc:
        raise MarketRefreshError("backend market refresh request was invalid") from exc
    except urllib.error.HTTPError as exc:
        # Never mirror a remote response body into scheduler logs; a broken or
        # compromised upstream could echo credentials or terminal controls.
        exc.read(500)
        raise MarketRefreshError(f"backend rejected market refresh ({exc.code})") from exc
    except urllib.error.URLError as exc:
        raise MarketRefreshError(f"backend market refresh failed: {exc.reason}") from exc


def _nonnegative_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise MarketRefreshError(f"backend returned invalid {field}")
    return value


def _validate_response(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict):
        raise MarketRefreshError("backend returned a non-object market refresh response")
    status = response.get("status")
    if status not in {"succeeded", "partially_succeeded"}:
        raise MarketRefreshError("backend returned an invalid market refresh status")
    inserted = _nonnegative_integer(response.get("inserted"), "inserted count")
    coverage = response.get("coverage")
    if not isinstance(coverage, dict):
        raise MarketRefreshError("backend returned no canonical market coverage")
    total_crops = _nonnegative_integer(coverage.get("total_crops"), "total crop count")
    current_crops = coverage.get("current_crops")
    stale_crops = coverage.get("stale_crops")
    missing_crops = coverage.get("missing_crops")
    if total_crops != len(CANONICAL_CROPS):
        raise MarketRefreshError("backend returned an unexpected canonical crop count")
    if (
        not _valid_crop_list(current_crops)
        or not _valid_crop_list(stale_crops)
        or not _valid_crop_list(missing_crops)
    ):
        raise MarketRefreshError("backend returned invalid canonical crop coverage")
    current_set = set(current_crops)
    stale_set = set(stale_crops)
    missing_set = set(missing_crops)
    if (
        current_set & stale_set
        or current_set & missing_set
        or stale_set & missing_set
        or len(current_crops) + len(stale_crops) + len(missing_crops) != total_crops
        or current_set | stale_set | missing_set != set(CANONICAL_CROPS)
        or current_crops != [crop for crop in CANONICAL_CROPS if crop in current_set]
        or stale_crops != [crop for crop in CANONICAL_CROPS if crop in stale_set]
        or missing_crops != [crop for crop in CANONICAL_CROPS if crop in missing_set]
    ):
        raise MarketRefreshError("backend returned inconsistent canonical crop coverage")
    sources = response.get("sources")
    if not isinstance(sources, list) or not sources:
        raise MarketRefreshError("backend returned no market source results")

    source_names: set[str] = set()
    succeeded = 0
    inserted_total = 0
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            raise MarketRefreshError(f"backend returned invalid market source result {index}")
        name = source.get("source")
        source_status = source.get("status")
        if not isinstance(name, str) or not name.strip() or name in source_names:
            raise MarketRefreshError("backend returned a missing or duplicate market source")
        source_names.add(name)
        if source_status not in {"succeeded", "failed"}:
            raise MarketRefreshError(f"backend returned invalid status for market source {name}")
        parsed = _nonnegative_integer(source.get("parsed"), f"parsed count for {name}")
        source_inserted = _nonnegative_integer(
            source.get("inserted"), f"inserted count for {name}"
        )
        if source_inserted > parsed:
            raise MarketRefreshError(f"backend inserted more rows than parsed for {name}")
        if source_status == "failed":
            if (
                parsed != 0
                or source_inserted != 0
                or source.get("error") not in {"SOURCE_TIMEOUT", "SOURCE_UNAVAILABLE"}
            ):
                raise MarketRefreshError(f"backend returned inconsistent failure for {name}")
        else:
            if "error" in source:
                raise MarketRefreshError(f"backend returned inconsistent success for {name}")
            succeeded += 1
            inserted_total += source_inserted

    if source_names != EXPECTED_MARKET_SOURCES:
        raise MarketRefreshError("backend returned an unexpected market source set")

    if inserted != inserted_total:
        raise MarketRefreshError("backend returned an inconsistent aggregate inserted count")
    expected_status = "succeeded" if succeeded == len(sources) else "partially_succeeded"
    if succeeded == 0 or status != expected_status:
        raise MarketRefreshError("backend returned an inconsistent aggregate market status")
    return response


def _valid_crop_list(value: Any) -> bool:
    return (
        isinstance(value, list)
        and all(isinstance(crop, str) and bool(crop.strip()) for crop in value)
        and len(set(value)) == len(value)
    )


def refresh_market_prices(
    *,
    backend_url: str = BACKEND_URL,
    internal_api_key: str = INTERNAL_API_KEY,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    allow_insecure_http: bool = False,
    http_post: HttpPost = _default_http_post,
) -> dict[str, Any]:
    normalized_api_key = internal_api_key.strip()
    if not normalized_api_key:
        raise MarketRefreshError("INTERNAL_API_KEY is required for market refresh")
    if any(ord(character) < 32 or ord(character) == 127 for character in normalized_api_key):
        raise MarketRefreshError("INTERNAL_API_KEY contains invalid control characters")
    if any(ord(character) > 126 for character in normalized_api_key):
        raise MarketRefreshError("INTERNAL_API_KEY must contain only ASCII characters")
    url = _market_refresh_url(
        backend_url,
        allow_insecure_http=allow_insecure_http,
    )
    raw_response = http_post(
        url,
        {
            "Accept": "application/json",
            "X-Internal-API-Key": normalized_api_key,
            "User-Agent": "MyanmarAgriMarketRefresh/1.0",
        },
        timeout_seconds,
    )
    try:
        response = json.loads(raw_response)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise MarketRefreshError("backend returned invalid market refresh JSON") from exc
    return _validate_response(response)


def main() -> int:
    try:
        result = refresh_market_prices(
            timeout_seconds=_timeout_seconds(
                os.environ.get("MARKET_REFRESH_REQUEST_TIMEOUT_SECONDS")
            ),
            allow_insecure_http=_boolean_environment_value(
                os.environ.get("ALLOW_INSECURE_MARKET_REFRESH_HTTP"),
                "ALLOW_INSECURE_MARKET_REFRESH_HTTP",
            ),
        )
    except MarketRefreshError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    stale_crops = result["coverage"]["stale_crops"]
    missing_crops = result["coverage"]["missing_crops"]
    if stale_crops:
        print(
            "WARNING: only stale market data for " + ", ".join(stale_crops),
            file=sys.stderr,
        )
    if missing_crops:
        print(
            "WARNING: no current market data for " + ", ".join(missing_crops),
            file=sys.stderr,
        )
    if result["status"] == "partially_succeeded":
        print("ERROR: one or more market sources failed", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Asia/Yangon weekly interval and source-coverage helpers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Iterable, Mapping
from zoneinfo import ZoneInfo

YANGON_TIMEZONE_NAME = "Asia/Yangon"
YANGON_TIMEZONE = ZoneInfo(YANGON_TIMEZONE_NAME)
EXPECTED_DAYS = 7


@dataclass(frozen=True)
class WeekWindow:
    """A Monday-based, end-exclusive week in Asia/Yangon."""

    start: date
    end: date

    @property
    def start_at(self) -> datetime:
        return datetime.combine(self.start, time.min, tzinfo=YANGON_TIMEZONE)

    @property
    def end_at(self) -> datetime:
        return datetime.combine(self.end, time.min, tzinfo=YANGON_TIMEZONE)

    @property
    def identifier(self) -> str:
        return self.start.isoformat()

    def contains(self, value: date) -> bool:
        return self.start <= value < self.end


def parse_week_start(value: str | date) -> WeekWindow:
    """Validate and return a Monday ``[week_start, next Monday)`` window."""

    if isinstance(value, datetime):
        start = value.date()
    elif isinstance(value, date):
        start = value
    else:
        try:
            start = date.fromisoformat(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("week_start must use YYYY-MM-DD format") from exc

    if start.weekday() != 0:
        raise ValueError("week_start must be a Monday in Asia/Yangon")
    return WeekWindow(start=start, end=start + timedelta(days=EXPECTED_DAYS))


def observation_month_for_week(value: str | date) -> str:
    """Return the monthly-model period containing the last included day."""

    window = parse_week_start(value)
    return (window.end - timedelta(days=1)).strftime("%Y-%m")


def _normalized_dates(values: Iterable[str | date | datetime], window: WeekWindow) -> set[date]:
    dates: set[date] = set()
    for value in values:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                parsed = value.date()
            else:
                parsed = value.astimezone(YANGON_TIMEZONE).date()
        elif isinstance(value, date):
            parsed = value
        else:
            try:
                parsed = date.fromisoformat(str(value)[:10])
            except ValueError as exc:
                raise ValueError(f"invalid source observation date: {value!r}") from exc
        if window.contains(parsed):
            dates.add(parsed)
    return dates


def build_coverage_metadata(
    week_start: str | date,
    source_observation_dates: Mapping[str, Iterable[str | date | datetime]],
    *,
    required_daily_sources: tuple[str, ...] = ("chirps", "era5"),
) -> dict[str, object]:
    """Build explicit overall and per-source coverage without imputing dates.

    Overall observation days are the intersection of all required daily-source
    dates.  A day is not counted as model-refresh-ready unless every required
    daily collection exists for that same date. Sentinel coverage is reported
    independently and is never padded to its revisit cadence.
    """

    window = parse_week_start(week_start)
    normalized = {
        source: _normalized_dates(values, window)
        for source, values in source_observation_dates.items()
    }
    if not required_daily_sources:
        raise ValueError("required_daily_sources must not be empty")
    missing_required = [source for source in required_daily_sources if source not in normalized]
    if missing_required:
        raise ValueError(f"missing required coverage sources: {missing_required}")

    jointly_observed_dates = set.intersection(
        *(normalized[source] for source in required_daily_sources)
    )
    observation_days = len(jointly_observed_dates)
    source_coverage = {
        source: round(min(len(dates), EXPECTED_DAYS) / EXPECTED_DAYS, 6)
        for source, dates in sorted(normalized.items())
    }
    source_observation_dates_json = {
        source: [value.isoformat() for value in sorted(dates)]
        for source, dates in sorted(normalized.items())
    }
    coverage_ratio = round(observation_days / EXPECTED_DAYS, 6)
    return {
        "week_start": window.start.isoformat(),
        "week_end": window.end.isoformat(),
        "observation_days": observation_days,
        "expected_days": EXPECTED_DAYS,
        "coverage_ratio": coverage_ratio,
        "is_partial_week": observation_days < EXPECTED_DAYS,
        "source_coverage": source_coverage,
        "source_observation_dates": source_observation_dates_json,
    }

"""Weekly operational prediction pipeline.

The near-real-time Early Warning/SMS implementation deliberately remains in
``daily_gee_monitor.py`` and ``early_warning_sms.py``.  This package is only for
the weekly model-input production path.
"""
from __future__ import annotations

__all__ = ["feature_builder", "validator", "window"]

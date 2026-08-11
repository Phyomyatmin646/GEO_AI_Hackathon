#!/bin/sh
# Daily wrapper for the authenticated market-price refresh endpoint.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

if [ -z "${PYTHON_BIN:-}" ]; then
    if [ -x "$PROJECT_DIR/.venv/bin/python" ]; then
        PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
    elif [ -x "$PROJECT_DIR/venv/bin/python" ]; then
        PYTHON_BIN="$PROJECT_DIR/venv/bin/python"
    else
        PYTHON_BIN=$(command -v python3 || true)
    fi
fi
if [ -z "$PYTHON_BIN" ] || [ ! -x "$PYTHON_BIN" ]; then
    echo "ERROR: set PYTHON_BIN to an available Python 3 interpreter" >&2
    exit 1
fi
if [ -z "${INTERNAL_API_KEY:-}" ]; then
    echo "ERROR: INTERNAL_API_KEY is required" >&2
    exit 1
fi

cd "$PROJECT_DIR"
exec "$PYTHON_BIN" scripts/run_market_refresh.py

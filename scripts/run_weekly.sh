#!/bin/bash
# Monday wrapper for the completed previous Asia/Yangon week.
# Early Warning/SMS has its own daily cadence and is not invoked here.

set -u

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
    echo "ERROR: set PYTHON_BIN to a Python environment with the project dependencies" >&2
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

# Compute the previous Monday in Asia/Yangon without relying on platform-specific
# BSD/GNU date flags. This wrapper is intended to run early each Monday.
WEEK_START=$(TZ=Asia/Yangon "$PYTHON_BIN" -c 'from datetime import datetime,timedelta; from zoneinfo import ZoneInfo; now=datetime.now(ZoneInfo("Asia/Yangon")); monday=now.date()-timedelta(days=now.weekday()+7); print(monday.isoformat())')

mkdir -p data/weekly
LOG_PATH="data/weekly/cron.log"
echo "============================================================" >> "$LOG_PATH"
echo "Starting weekly pipeline for $WEEK_START at $(TZ=Asia/Yangon date)" >> "$LOG_PATH"

"$PYTHON_BIN" scripts/run_weekly_pipeline.py \
  --week-start "$WEEK_START" \
  --regions all >> "$LOG_PATH" 2>&1
EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
    echo "Successfully completed weekly pipeline for $WEEK_START" >> "$LOG_PATH"
else
    echo "ERROR: Weekly pipeline failed with exit code $EXIT_CODE" >> "$LOG_PATH"
fi

echo "============================================================" >> "$LOG_PATH"
exit "$EXIT_CODE"

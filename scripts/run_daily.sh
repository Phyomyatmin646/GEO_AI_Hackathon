#!/bin/bash
# Wrapper script to run the daily pipeline via cron or manual execution

# Move to the pipeline directory
cd /Users/phyomyatmin/Desktop/myanmar-agri-geo-csv-pipeline || exit 1

# Get today's date in YYYY-MM-DD format
TODAY=$(date +"%Y-%m-%d")

# Ensure the log directory exists
mkdir -p data/daily

echo "============================================================" >> data/daily/cron.log
echo "Starting daily pipeline for $TODAY at $(date)" >> data/daily/cron.log

# Run the pipeline for all 6 regions using the virtual environment
/Users/phyomyatmin/Desktop/GEO_model_server/.venv/bin/python scripts/run_daily_pipeline.py --date "$TODAY" --regions all >> data/daily/cron.log 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "Successfully completed daily pipeline for $TODAY" >> data/daily/cron.log
else
    echo "ERROR: Daily pipeline failed with exit code $EXIT_CODE" >> data/daily/cron.log
fi

echo "============================================================" >> data/daily/cron.log
exit $EXIT_CODE

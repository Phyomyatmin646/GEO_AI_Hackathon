FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (required for geopandas/rasterio)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml and the source code
COPY pyproject.toml README.md ./
COPY src/ ./src/

# Install the Python package and its dependencies
RUN pip install --default-timeout=1000 --no-cache-dir .[full]

# Keep the container alive so we can attach to it to run scripts
CMD ["tail", "-f", "/dev/null"]

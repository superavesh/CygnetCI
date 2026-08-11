# CygnetCI FastAPI backend
FROM python:3.11-slim

# System deps (psycopg2-binary bundles libpq; curl is handy for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# config.ini is provided at runtime via a mounted Secret at /app/config.ini
# (do NOT bake credentials into the image).

EXPOSE 8000

# reload=false in production — start uvicorn directly
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

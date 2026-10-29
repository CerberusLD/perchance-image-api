FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000

# Firefox / Camoufox runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxfixes3 libxshmfence1 \
    libnss3 libnspr4 libxss1 fonts-dejavu-core ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the patched Firefox used by Camoufox
RUN python -m camoufox fetch

COPY perchance_client.py server.py perchance-styles.json ./

EXPOSE 8000
CMD ["gunicorn", "-w", "1", "-t", "600", "-b", "0.0.0.0:8000", "server:app"]

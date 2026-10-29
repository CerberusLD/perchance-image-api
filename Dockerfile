FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY perchance_client.py server.py perchance-styles.json ./

EXPOSE 8000
# 1 worker + threads: /health stays responsive while a generation is running.
CMD gunicorn -w 1 --threads 8 -t 600 -b 0.0.0.0:${PORT:-8000} server:app

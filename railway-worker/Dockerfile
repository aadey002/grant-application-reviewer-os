FROM python:3.12-slim

WORKDIR /app

# Install tesseract for OCR of scanned PDF pages
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Verify FastAPI app loads without heavy deps
RUN python -c "from fastapi import FastAPI; print('FastAPI OK')"
# consensus_review module added 2026-08-03

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

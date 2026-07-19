FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Verify FastAPI app loads without heavy deps
RUN python -c "from fastapi import FastAPI; print('FastAPI OK')"

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

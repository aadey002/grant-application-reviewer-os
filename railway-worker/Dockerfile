FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Verify imports work at build time
RUN python -c "from scoring.safe_review import extract_nofo_criteria; from scoring.anthropic_review import score_application_with_claude; print('imports OK')"

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

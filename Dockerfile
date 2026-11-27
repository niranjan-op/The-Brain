FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-dejavu-core \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    HF_HOME=/app/.cache/huggingface \
    PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --group worker

# Pre-cache the 768-dim local embedding model so Cloud Run cold starts never hit HuggingFace.
RUN python -c "from transformers import AutoModel, AutoTokenizer; AutoTokenizer.from_pretrained('BAAI/bge-base-en-v1.5'); AutoModel.from_pretrained('BAAI/bge-base-en-v1.5')"

COPY main.py alembic.ini ./
COPY migrations ./migrations
COPY src ./src

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]

# CropShield backend image (FastAPI + committed ML artifacts). Build from the repo root:
#   docker build -f backend/Dockerfile -t cropshield-api .
# The image does NOT train models: it serves the artifacts committed under
# ml/training/saved_models/. Retrain offline with `python -m ml.training.train_model`.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# libgomp1: OpenMP runtime for xgboost / scikit-learn; curl: container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps. torch/torchvision come from the CPU-only PyTorch index first, so the
# generic requirement lines below are already satisfied and pip does not pull CUDA wheels.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
COPY backend/requirements.txt ./requirements.txt
RUN pip install --index-url "${TORCH_INDEX_URL}" "torch>=2.2" "torchvision>=0.17" \
    && pip install -r requirements.txt

# App code + runtime data only (see .dockerignore for what is excluded)
COPY backend ./backend
COPY ml ./ml
COPY scripts ./scripts
COPY saved_models ./saved_models
# Reference CSVs read at runtime / by the seeders (crop rules, cost templates, FAO-56
# coefficients, demo scenarios, soil demo reports, demo P&L). Unused datasets are excluded.
COPY *.csv ./

# Unprivileged runtime user; only uploads/ and data/ (SQLite) need to be writable.
RUN useradd --create-home --uid 10001 cropshield \
    && mkdir -p uploads/disease_images uploads/receipts uploads/soil_reports data \
    && chown -R cropshield:cropshield uploads data
USER cropshield

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

# AgriGuard AI — Production Deployment Guide

This guide covers deploying **AgriGuard AI / CropShield** with Docker Compose (recommended) or natively
behind nginx. The stack has three parts: MongoDB, the FastAPI backend and the React PWA.

---

## 1. Prerequisites

- **Docker** 24+ with Docker Compose v2.20+ (for the container route)
- **Python 3.12** (native route; the committed model artifacts need pandas 3 / scikit-learn 1.8 / xgboost 3.2)
- **Node.js 20** + npm (only to build the frontend natively)
- **MongoDB 7** (native route)

---

## 2. Secrets and environment

Nothing secret is committed. The backend reads environment variables first, then `config/.env`
(native runs). For Docker Compose, create a `.env` file next to `docker-compose.yml`. Both files are git-ignored.

| Variable | Required | Notes |
|---|---|---|
| `SECRET_KEY` | **yes (production)** | JWT signing key, at least 16 random characters. With `APP_ENV=production` the API refuses to start without it. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `APP_ENV` | yes | `production` in deployments (disables demo P&L seeding, enforces `SECRET_KEY`). Compose defaults to `production`. |
| `CORS_ORIGINS` | no | Comma-separated list or JSON array of browser origins. Not needed when the SPA and API share an origin through nginx (the setup below). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | no | Web push. Leave empty to disable push (`/notifications/vapid-public-key` then returns `push_enabled: false`). Generate a pair with `npx web-push generate-vapid-keys`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` | no | Real SMS/WhatsApp (also `pip install twilio`). Without them delivery is simulated (logged only). |
| `MONGODB_URL`, `MONGODB_DB_NAME` | native only | Compose sets them for you. |
| `SEED_DEMO_DATA` | no (compose) | `true` seeds the demo users `farmer@/agronomist@/admin@cropshield.org` with **public demo passwords**. Never enable it on a public deployment. |
| `MONGO_EXPRESS_PASSWORD` | only with `--profile tools` | Basic-auth password for mongo-express. |

> **Rotate old secrets.** Earlier revisions committed a JWT secret and a VAPID key pair. They are in git
> history, so treat them as compromised and generate new values.

---

## 3. Docker Compose deployment (recommended)

```bash
# 1. secrets (git-ignored)
cat > .env <<'EOF'
SECRET_KEY=<paste a random 48+ char string>
APP_ENV=production
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
EOF

# 2. build and start
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

What runs:

| Service | Published on | Notes |
|---|---|---|
| `frontend` | `http://<host>:8080` (`FRONTEND_PORT`) | nginx serves the built SPA and **reverse-proxies `/api/` and `/uploads/` to the backend** (`deploy/nginx.conf`). |
| `backend` | `127.0.0.1:8000` only | Swagger at `http://127.0.0.1:8000/api/v1/docs` from the host. Runs as a non-root user. Health: `GET /api/v1/health`. |
| `mongo` | `127.0.0.1:27017` only | No authentication is configured, so never publish it on a public interface. |
| `mongo-express` | `127.0.0.1:8081`, opt-in | `docker compose --profile tools up -d mongo-express` (set `MONGO_EXPRESS_PASSWORD` first). |

Notes:
- **No training at startup.** The image serves the committed artifacts in `ml/training/saved_models/`.
  Retrain offline (`python -m ml.training.train_model`, about 18 minutes, needs `ml/data/nasa_power_raw/`),
  commit the new artifacts, then rebuild the image.
- Uploads (`/app/uploads`) and the legacy SQLite file (`/app/data/cropshield.db`) live in named volumes.
- First admin account: seed the demo accounts once on a private network
  (`docker compose exec backend python -m scripts.init_mongo_db`), sign in as the demo admin, create real
  admin/agronomist accounts from the Admin screen, then deactivate the demo users.
  Self-registration (`/auth/register`) always creates a farmer.
- The API rate limiters and the ingestion job lock are in-process. Run a **single** uvicorn worker
  (the default command), or move those to a shared store before scaling out.

---

## 4. Native local execution

```bash
python -m venv venv
venv\Scripts\activate            # Windows
source venv/bin/activate         # Linux/macOS
pip install -r backend/requirements.txt          # add backend/requirements-dev.txt for tests
cp config/.env.example config/.env               # then set SECRET_KEY
python -m scripts.init_mongo_db                  # demo users/farms (development only)
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
cd frontend && npm install && npm run dev        # http://localhost:5173 (Vite proxies /api and /uploads)
```

On Windows, `run_backend.bat`, `run_frontend.bat` and `run_all.bat` do the same. `run_backend.bat` creates
`config/.env` from the example and warns if `SECRET_KEY` is empty.

Tests use an isolated database (`cropshield_test`) and skip when MongoDB is not reachable:
`python -m pytest tests -q` (see `tests/conftest.py`).

---

## 5. Serving the frontend in production

The Vite dev server proxies `/api` and `/uploads` to the backend, but **a static file server such as
`serve -s dist` does not**. The built SPA calls relative URLs (`/api/v1/...`, and receipt/lab-report/leaf
images under `/uploads/...`), so in production these paths must reach the backend on the same origin.

Recommended: put nginx in front of both (this is what `deploy/nginx.conf` does inside the compose `frontend`
container). For a VM without Docker:

```nginx
server {
    listen 80;
    server_name agriguard.example.org;

    root /var/www/agriguard-frontend/dist;   # output of `npm run build`
    index index.html;
    client_max_body_size 11m;                # API upload cap is 10 MB

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Run uvicorn with `--proxy-headers --forwarded-allow-ips=127.0.0.1` so the login rate limiter sees real
client IPs. Terminate TLS at nginx (for example with certbot): the PWA service worker and web push only work over HTTPS.

Alternative: serve the SPA from a different origin and build it with `VITE_API_BASE_URL=https://api.example.org`.
Then add that SPA origin to `CORS_ORIGINS`. Note that `/uploads` links returned by the API are relative, so the
same-origin nginx setup above is simpler.

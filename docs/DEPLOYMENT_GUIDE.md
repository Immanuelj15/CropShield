# AgriGuard AI — Production Deployment Guide

This guide describes the complete procedure for deploying **AgriGuard AI** on cloud infrastructure (AWS EC2, Google Cloud Compute, Azure VM) or local on-premise servers using Docker Compose, Uvicorn, and Nginx.

---

## 1. Prerequisites

- **OS**: Ubuntu 22.04 LTS / Debian 12 / Windows Server / macOS
- **Docker**: Version 24.0+ & Docker Compose v2.20+
- **Python**: 3.10+ (if running natively without Docker)
- **Node.js**: 18.0+ & npm 9.0+

---

## 2. Environment Configuration

1. Clone the repository and navigate to the project directory:
   ```bash
   cd cropshield-pest
   ```

2. Configure environment variables in `config/.env`:
   ```ini
   PORT=8000
   ENV=production
   DATABASE_URL=sqlite:///./cropshield.db
   SECRET_KEY=agriguard_ai_super_secret_production_key_2026
   CORS_ORIGINS=["*"]
   ```

---

## 3. Docker Compose Deployment (Recommended)

To launch the full stack (FastAPI Backend + React Frontend + SQLite/PostgreSQL) with a single command:

```bash
docker-compose up --build -d
```

### Checking Container Health:
```bash
docker-compose ps
docker-compose logs -f backend
```

- **Backend API**: `http://localhost:8000`
- **Swagger API Docs**: `http://localhost:8000/api/v1/docs`
- **Frontend Web App**: `http://localhost:5173` (or port 80 in production Nginx)

---

## 4. Native Local Execution

### Step 1: Backend Setup
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r backend/requirements.txt
```

### Step 2: Initialize Database & Train Models
```bash
# Initialize DB tables
python -m scripts.init_db

# Train XGBoost Climate Pest Model
python -m ml.training.train_model

# Train PyTorch Disease Classifier
python -m ml.disease_detection.train_and_evaluate
```

### Step 3: Run FastAPI Backend
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 4: Run React Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Nginx Production Reverse Proxy Configuration

Add the following Nginx block to `/etc/nginx/sites-available/agriguard`:

```nginx
server {
    listen 80;
    server_name agriguard.ai www.agriguard.ai;

    location / {
        root /var/www/agriguard-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/agriguard /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

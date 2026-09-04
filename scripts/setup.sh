#!/usr/bin/env bash
# ============================================================
# CropShield — One-Command Local Setup Script
# Usage: bash scripts/setup.sh
# ============================================================

set -e

echo "═══════════════════════════════════════════"
echo "  CropShield — Full Stack Setup"
echo "═══════════════════════════════════════════"

# Detect OS
OS="$(uname -s)"

# ── 1. Check Python ──────────────────────────────────────────
echo ""
echo "▶ Checking Python..."
python3 --version || { echo "❌ Python 3.11+ required"; exit 1; }

# ── 2. Create virtualenv ─────────────────────────────────────
echo ""
echo "▶ Creating virtual environment..."
python3 -m venv venv
if [ "$OS" = "Windows_NT" ] || [[ "$OS" == *"MINGW"* ]]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi

# ── 3. Install Python deps ───────────────────────────────────
echo ""
echo "▶ Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r backend/requirements.txt -q
echo "✅ Python dependencies installed"

# ── 4. Copy env file ─────────────────────────────────────────
echo ""
echo "▶ Setting up environment config..."
if [ ! -f config/.env ]; then
    cp config/.env.example config/.env
    echo "✅ Created config/.env from template"
    echo "   ⚠️  Edit config/.env to set your DATABASE_URL if using PostgreSQL"
else
    echo "   config/.env already exists, skipping"
fi

# ── 5. Initialize DB ─────────────────────────────────────────
echo ""
echo "▶ Initializing database..."
python -m scripts.init_db
echo "✅ Database ready"

# ── 6. Train ML model ────────────────────────────────────────
echo ""
echo "▶ Training XGBoost model (may take 1-2 minutes)..."
python -m ml.training.train_model
echo "✅ Model trained and saved"

# ── 7. Frontend ──────────────────────────────────────────────
echo ""
echo "▶ Installing frontend dependencies..."
cd frontend
npm install -q
cd ..
echo "✅ Frontend dependencies installed"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Setup Complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  To start the system:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    source venv/bin/activate"
echo "    uvicorn backend.main:app --reload --port 8000"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Or with Docker:"
echo "    docker-compose up --build"
echo ""
echo "  API Docs: http://localhost:8000/api/v1/docs"
echo "  Frontend: http://localhost:5173"
echo "═══════════════════════════════════════════"

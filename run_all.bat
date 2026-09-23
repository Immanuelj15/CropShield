@echo off
title AgriGuard AI Launcher
echo ==========================================
echo       Launching AgriGuard AI Platform
echo ==========================================
echo Starting FastAPI Backend (Port 8000)...
start "AgriGuard Backend (FastAPI)" cmd /k "run_backend.bat"
timeout /t 3 /nobreak >nul
echo Starting Vite React Frontend (Port 5173)...
start "AgriGuard Frontend (Vite React)" cmd /k "run_frontend.bat"
echo ==========================================
echo AgriGuard is launching!
echo Backend API docs: http://127.0.0.1:8000/docs
echo Frontend Web App: http://localhost:5173
echo ==========================================

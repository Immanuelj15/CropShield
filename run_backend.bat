@echo off
title AgriGuard AI Backend
echo ==========================================
echo      Starting AgriGuard AI FastAPI Backend
echo ==========================================
cd /d "%~dp0"
if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Using available Python environment...
)
echo Starting backend server with Uvicorn on http://127.0.0.1:8000 ...
python -m uvicorn backend.main:app --reload --port 8000
pause


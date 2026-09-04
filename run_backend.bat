@echo off
title AgriGuard AI Backend
echo ==========================================
echo      Starting AgriGuard AI FastAPI Backend
echo ==========================================
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat (
    echo Error: Virtual environment 'venv' not found.
    echo Please make sure you are in the cropshield-pest directory.
    pause
    exit /b
)
echo Activating virtual environment...
call venv\Scripts\activate.bat
echo Starting backend server with Uvicorn...
uvicorn backend.main:app --reload --port 8000
pause

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
    echo Install dependencies once with: pip install -r backend\requirements.txt
)

rem Settings are read from environment variables and config\.env (see config\.env.example).
if not exist config\.env (
    echo config\.env not found - creating it from config\.env.example ...
    copy /Y config\.env.example config\.env >nul
)

rem SECRET_KEY signs login tokens. Without it a random key is used in development and every
rem login is invalidated when the server restarts; with APP_ENV=production the server refuses to start.
if not defined SECRET_KEY (
    findstr /R /C:"^SECRET_KEY=.." config\.env >nul 2>&1
    if errorlevel 1 (
        echo.
        echo WARNING: SECRET_KEY is not set in config\.env or the environment.
        echo          Generate one with:  python -c "import secrets; print(secrets.token_urlsafe(48))"
        echo          and put it on the SECRET_KEY= line in config\.env.
        echo.
    )
)
rem Optional: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY enable web push; CORS_ORIGINS lists allowed browser origins.

echo Starting backend server with Uvicorn on http://127.0.0.1:8000 ...
python -m uvicorn backend.main:app --reload --port 8000
pause

@echo off
title AgriGuard AI Frontend
echo ==========================================
echo      Starting AgriGuard AI Vite Frontend
echo ==========================================
cd /d "%~dp0\frontend"
if not exist node_modules (
    echo node_modules folder not found. Installing dependencies...
    call npm install
)
echo Starting frontend dev server with Vite...
npm run dev
pause

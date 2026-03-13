@echo off
REM Run script for IELTS Speaking Practice App (Windows)

echo Starting IELTS Speaking Practice App...

REM Start backend in a separate window
start "IELTS Backend" cmd /k "cd /d backend && call venv\Scripts\activate.bat && python main.py"

REM Wait a bit for backend to start
timeout /t 5 /nobreak >nul

REM Start frontend in a separate window
start "IELTS Frontend" cmd /k "cd /d frontend && npm start"

echo Applications started in separate windows!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
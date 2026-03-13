@echo off
REM Activate virtual environment and start the backend server
cd /d "%~dp0"
call venv\Scripts\activate.bat
python main.py
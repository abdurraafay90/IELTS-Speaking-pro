@echo off
REM Setup script for IELTS Speaking Practice App (Windows)

echo Setting up IELTS Speaking Practice App...

REM Setup backend
echo Setting up backend...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
echo Backend setup complete!

REM Setup frontend
echo Setting up frontend...
cd ..\frontend
npm install
echo Frontend setup complete!

echo Setup complete! To run the app:
echo 1. Start backend: cd backend ^&^& call venv\Scripts\activate.bat ^&^& python main.py
echo 2. In another terminal, start frontend: cd frontend ^&^& npm start
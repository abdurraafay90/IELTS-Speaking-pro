#!/bin/bash
# Setup script for IELTS Speaking Practice App

echo "Setting up IELTS Speaking Practice App..."

# Setup backend
echo "Setting up backend..."
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "Backend setup complete!"

# Setup frontend
echo "Setting up frontend..."
cd ../frontend
npm install
echo "Frontend setup complete!"

echo "Setup complete! To run the app:"
echo "1. Start backend: cd backend && source venv/bin/activate && python main.py"
echo "2. In another terminal, start frontend: cd frontend && npm start"
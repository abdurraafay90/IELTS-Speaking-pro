#!/bin/bash
# Activate virtual environment and start the backend server
cd "$(dirname "$0")"
source venv/bin/activate
python main.py
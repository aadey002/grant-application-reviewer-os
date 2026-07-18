#!/bin/bash

# Grant Reviewer V2 Backend Startup Script

echo "Starting Grant Reviewer V2 Backend..."

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Install dependencies if not already installed
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the FastAPI server
echo "Starting FastAPI server on port 8000..."
python main.py

#!/bin/bash

# Grant Reviewer Backend Startup Script

echo "Grant Reviewer Backend - Starting..."
echo "===================================="

# Navigate to backend directory
cd "$(dirname "$0")/backend"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python3 is not installed"
    exit 1
fi

# Start the backend
python3 start_backend.py

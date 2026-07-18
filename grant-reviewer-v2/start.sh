#!/bin/bash
# Grant Reviewer V2 - Unified Frontend + Backend

echo "Starting Grant Reviewer V2 Unified Platform..."

# Install frontend dependencies
echo "Installing frontend dependencies..."
pnpm install

# Build frontend
echo "Building frontend..."
pnpm run build

# Install backend dependencies
echo "Installing backend dependencies..."
pip install -r requirements.txt

# Start unified server
echo "Starting unified server (Frontend + Backend)..."
python server.py

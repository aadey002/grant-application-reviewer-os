#!/bin/sh
# STDIO mode startup script for Grant Reviewer MCP Server
# Suitable for local tool integration with Claude Desktop and other MCP clients

set -e

# Change to script directory
cd "$(dirname "$0")"

# Create independent virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..." >&2
    uv venv
    echo "Installing dependencies..." >&2
    echo "Note: Dependency installation may take several minutes. Please wait..." >&2
    uv sync 
fi

# Activate virtual environment and start STDIO mode MCP server
echo "Starting Grant Reviewer MCP Server..." >&2
uv run python server.py

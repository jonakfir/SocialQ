#!/bin/bash
cd "$(dirname "$0")/backend"

# Kill any existing backend process
pkill -f "node.*server.js" 2>/dev/null || true
sleep 0.5

# Start backend server
echo "🚀 Starting backend server..."
node server.js


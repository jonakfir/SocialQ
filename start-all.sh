#!/bin/bash
# Quick start script for both frontend and backend

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Kill any existing servers
echo "🛑 Stopping any existing servers..."
pkill -f "node server.js" 2>/dev/null
pkill -f "vite dev" 2>/dev/null
sleep 1

# Start backend in background
echo "🚀 Starting backend..."
cd "$BACKEND_DIR"
node server.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo "   Logs: tail -f /tmp/backend.log"

# Start frontend in background
echo "🚀 Starting frontend..."
cd "$FRONTEND_DIR"
# Generate .svelte-kit files first to prevent blocking
echo "   Syncing SvelteKit..."
npx svelte-kit sync > /dev/null 2>&1
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo "   Logs: tail -f /tmp/frontend.log"

# Wait a moment for servers to start
sleep 3

# Check if they're running
echo ""
echo "✅ Servers starting..."
echo ""
echo "📊 Status:"
echo "   Backend:  http://localhost:8080"
echo "   Frontend: http://localhost:5173"
echo ""
echo "📝 To view logs:"
echo "   Backend:  tail -f /tmp/backend.log"
echo "   Frontend: tail -f /tmp/frontend.log"
echo ""
echo "🛑 To stop: ./stop-all.sh"
echo ""


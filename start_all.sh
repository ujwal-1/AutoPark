#!/bin/bash

echo "🚀 Starting AutoPark Smart Parking System..."

# Kill any running instances on ports 8000 & 3000
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo "Starting FastAPI Backend Server on port 8000..."
cd backend && python3 start_backend.py &
BACKEND_PID=$!

echo "Starting Next.js Frontend Dashboard on port 3000..."
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "----------------------------------------------------"
echo "AutoPark backend running on: http://localhost:8000"
echo "AutoPark dashboard running on: http://localhost:3000"
echo "----------------------------------------------------"

wait $BACKEND_PID $FRONTEND_PID

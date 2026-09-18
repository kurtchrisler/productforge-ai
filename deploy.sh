#!/bin/bash
set -e
echo "Pulling latest code from GitHub..."
git pull
echo "Rebuilding and restarting the app..."
docker compose up -d --build
echo "Done. Recent logs:"
docker compose logs --tail=20

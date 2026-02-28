#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
APP_NAME="easycord"
IMAGE_NAME="easycord:latest"
HOST_PORT="8081"

echo ">>> [1/4] Pulling latest code from Git..."
git pull origin main || git pull origin master

echo ">>> [2/4] Building Docker image..."
if ! docker build -t "${IMAGE_NAME}" . ; then
  echo "!!! Build failed!"
  exit 1
fi

echo ">>> [3/4] Stopping and removing existing container..."
if docker ps -a --format '{{.Names}}' | grep -q "^${APP_NAME}$"; then
  docker stop "${APP_NAME}" >/dev/null 2>&1 || true
  docker rm "${APP_NAME}" >/dev/null 2>&1 || true
fi

echo ">>> [4/4] Starting new container on port ${HOST_PORT}..."
docker run -d \
  --name "${APP_NAME}" \
  -p "${HOST_PORT}:80" \
  --restart unless-stopped \
  "${IMAGE_NAME}"

echo ">>> Cleaning up old images..."
docker image prune -f

echo "Done! ${APP_NAME} is running at http://localhost:${HOST_PORT}"
docker logs -f --tail 20 "${APP_NAME}"

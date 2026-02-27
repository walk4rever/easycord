#!/usr/bin/env bash
set -euo pipefail

APP_NAME="easycord"
IMAGE_NAME="easycord:latest"
HOST_PORT="8080"

docker build -t "${IMAGE_NAME}" .

if docker ps -a --format '{{.Names}}' | grep -q "^${APP_NAME}$"; then
  docker stop "${APP_NAME}" >/dev/null 2>&1 || true
  docker rm "${APP_NAME}" >/dev/null 2>&1 || true
fi

docker run -d --name "${APP_NAME}" -p "${HOST_PORT}:80" --restart unless-stopped "${IMAGE_NAME}"

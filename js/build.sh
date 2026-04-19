#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

bash install.sh

rm -rf dist

echo "[build] Building production bundle..."
pnpm run build

echo "[build] Syncing static assets..."
cp -rf public/* dist/

echo "Build completed successfully."

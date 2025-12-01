#!/bin/bash
set -euo pipefail

# Move to project root (agent-workbench)
cd "$(dirname "$0")/.."

echo 'Running dashboard regression build...'
npm run build >/tmp/dashboard-build.log 2>&1
echo 'Build succeeded. Logs saved to /tmp/dashboard-build.log'

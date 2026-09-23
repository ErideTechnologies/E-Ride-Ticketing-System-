#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
exec pnpm --filter @workspace/scripts migration:reconcile-attachments
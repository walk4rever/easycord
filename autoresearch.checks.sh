#!/bin/bash
set -euo pipefail
npm run build >/tmp/easycord-build.log 2>&1 || { tail -80 /tmp/easycord-build.log; exit 1; }

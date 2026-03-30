#!/bin/bash
set -euo pipefail
npx playwright test scripts/firefox_transcode_benchmark.spec.mjs --config=playwright.firefox-bench.config.mjs --reporter=line

#!/usr/bin/env bash
set -euo pipefail

mkdir -p .hf-central
cat .central-source/*.b64 | base64 --decode > .hf-central/HF-Central-Overlay.zip
echo "0de87f14c863b7a7cb00aaa2f3519f848915f00b62f5fb11410bcbd6220dc843  .hf-central/HF-Central-Overlay.zip" | sha256sum --check
unzip -oq .hf-central/HF-Central-Overlay.zip -d .hf-central
test -f .hf-central/admin/index.html
test -f .hf-central/platform/app-overlay/reports.js
echo "HF Central overlay extracted and verified."

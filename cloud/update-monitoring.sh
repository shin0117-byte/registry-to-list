#!/usr/bin/env bash
set -euo pipefail
PROJECT=registry-ocr-123456
REGION=asia-east1
SERVICE=registry-ocr
cd "$(dirname "$0")/.."
# Updating source without env-var flags preserves the existing access code.
ACCOUNT=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')
if [ -z "$ACCOUNT" ]; then printf '無法確認既有服務帳戶，停止更新。\n'; exit 1; fi
gcloud services enable monitoring.googleapis.com --project="$PROJECT"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/monitoring.viewer --condition=None >/dev/null
STAGE=$(mktemp -d)
mkdir -p "$STAGE/public/vendor"
cp cloud/server.mjs cloud/usage.mjs cloud/Dockerfile "$STAGE/"
cp index.html app.js styles.css cloud-config.js cloud-ocr.js land-sections.json localities.json roads.json "$STAGE/public/"
cp vendor/pdf.mjs vendor/pdf.worker.mjs "$STAGE/public/vendor/"
gcloud run deploy "$SERVICE" --source="$STAGE" --project="$PROJECT" --region="$REGION" --quiet
printf '\n新版服務已部署。原 OCR 使用碼保持不變。\n'

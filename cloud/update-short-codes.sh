#!/usr/bin/env bash
set -euo pipefail
PROJECT=registry-ocr-123456
REGION=asia-east1
SERVICE=registry-ocr
cd "$(dirname "$0")/.."
# Update the existing service only. Preserve env vars, secrets, IAM and billing mode.
SERVICE_URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
if [ -z "$SERVICE_URL" ]; then printf '找不到既有 OCR 服務，停止更新。\n'; exit 1; fi
STAGE=$(mktemp -d)
mkdir -p "$STAGE/public"
cp cloud/server.mjs cloud/usage.mjs cloud/billing.mjs cloud/firestore-store.mjs cloud/Dockerfile "$STAGE/"
cp index.html admin.html admin.js billing-client.js app.js registry-model.js scan-history.js pdf-export.js xlsx-export.js address-recovery.js styles.css cloud-config.js cloud-ocr.js land-sections.json localities.json roads.json "$STAGE/public/"
cp -R vendor ocr-assets "$STAGE/public/"
gcloud run deploy "$SERVICE" --source="$STAGE" --project="$PROJECT" --region="$REGION" --quiet
curl --fail --silent --show-error "$SERVICE_URL/api/health" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("customerCodeFormat")=="short16-v1", "短碼版本尚未生效"; print("短碼版本部署成功。請重新整理管理頁面；新客戶使用碼為16碼，舊碼與餘額保持不變。")'

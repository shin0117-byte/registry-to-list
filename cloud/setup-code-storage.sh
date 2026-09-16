#!/usr/bin/env bash
set -euo pipefail
PROJECT=registry-ocr-123456
REGION=asia-east1
SERVICE=registry-ocr
SECRET=registry-ocr-code-key
ACCOUNT=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')
if [ -z "$ACCOUNT" ]; then printf '無法取得服務帳戶，停止。\n'; exit 1; fi
gcloud services enable secretmanager.googleapis.com --project="$PROJECT"
# List successfully first: permission/network errors must not be mistaken for a missing key.
EXISTING=$(gcloud secrets list --project="$PROJECT" --filter="name:$SECRET" --format='value(name)')
if [ -z "$EXISTING" ]; then
 gcloud secrets create "$SECRET" --replication-policy=automatic --project="$PROJECT" >/dev/null
 openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT" >/dev/null
fi
STATE=$(gcloud secrets versions describe 1 --secret="$SECRET" --project="$PROJECT" --format='value(state)')
if [ "$STATE" != ENABLED ]; then printf '原加密金鑰第 1 版不可用，請復原原金鑰，不可重新產生替換。\n'; exit 1; fi
gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor --project="$PROJECT" >/dev/null
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --update-secrets="OCR_CODE_KEY=$SECRET:1" --quiet
printf '使用碼加密金鑰已設定；未變更收費開關。請勿刪除或替換原金鑰。\n'

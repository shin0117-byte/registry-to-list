#!/usr/bin/env bash
set -euo pipefail
PROJECT=registry-ocr-123456
REGION=asia-east1
SERVICE=registry-ocr
ACCOUNT=registry-ocr-service
cd "$(dirname "$0")/.."
# Initial deployment must never overwrite an existing service's billing settings.
if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
 printf '服務已存在，請使用 bash cloud/update-service.sh 保留現有密碼與計費設定。\n'
 exit 1
fi
gcloud projects describe "$PROJECT" --format='value(projectId)'
gcloud services enable vision.googleapis.com monitoring.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project="$PROJECT"
if ! gcloud iam service-accounts describe "$ACCOUNT@$PROJECT.iam.gserviceaccount.com" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$ACCOUNT" --display-name="Registry OCR" --project="$PROJECT"
fi
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT@$PROJECT.iam.gserviceaccount.com" --role=roles/serviceusage.serviceUsageConsumer --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT@$PROJECT.iam.gserviceaccount.com" --role=roles/monitoring.viewer --condition=None >/dev/null
STAGE=$(mktemp -d)
mkdir -p "$STAGE/public/vendor"
cp cloud/server.mjs cloud/usage.mjs cloud/billing.mjs cloud/firestore-store.mjs cloud/Dockerfile "$STAGE/"
cp index.html admin.html admin.js billing-client.js app.js styles.css cloud-config.js cloud-ocr.js land-sections.json localities.json roads.json "$STAGE/public/"
cp vendor/pdf.mjs vendor/pdf.worker.mjs "$STAGE/public/vendor/"
read -r -s -p "請設定至少 16 字元的 OCR 使用碼（再次部署請輸入原使用碼）: " OCR_CODE
printf '\n'
if [ "$(printf %s "$OCR_CODE" | wc -m)" -lt 16 ]; then printf '使用碼至少 16 字元\n'; exit 1; fi
export OCR_CODE PROJECT
python3 -c 'import json,os; print(json.dumps({"OCR_ACCESS_CODE":os.environ["OCR_CODE"],"GOOGLE_CLOUD_PROJECT":os.environ["PROJECT"]}))' > "$STAGE-env.json"
chmod 600 "$STAGE-env.json"
trap 'rm -f -- "$STAGE-env.json"' EXIT
gcloud run deploy "$SERVICE" --source="$STAGE" --project="$PROJECT" --region="$REGION" \
 --service-account="$ACCOUNT@$PROJECT.iam.gserviceaccount.com" --allow-unauthenticated \
 --env-vars-file="$STAGE-env.json" --memory=512Mi --cpu=1 --min-instances=0 --max-instances=1 --concurrency=4 --timeout=120
URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
printf '\n網站部署網址：%s\n請將此網址提供給維護者，以更新 GitHub Pages 的 OCR 連線。\n' "$URL"
curl --fail --silent "$URL/api/health"

#!/usr/bin/env bash
set -euo pipefail
PROJECT=registry-ocr-123456
REGION=asia-east1
SERVICE=registry-ocr
DATABASE=ocr-billing
SECRET=registry-ocr-admin
cd "$(dirname "$0")/.."
printf '此操作將建立點數資料庫、啟用 TTL 與 Secret Manager，可能產生雲端費用。\n'
printf '只開放管理後台，尚不切換客戶扣點；原使用碼維持可用。\n'
read -r -p '確認準備後台請輸入 PREPARE：' CONFIRM
if [ "$CONFIRM" != PREPARE ]; then exit 1; fi
URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
ACTIVE=$(curl --fail --silent "$URL/api/health" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("billingEnabled",False)).lower())')
if [ "$ACTIVE" = true ]; then printf '正式計費已啟用，請使用 update-service.sh，不要重做初始化。\n'; exit 1; fi
ACCOUNT=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')
if [ -z "$ACCOUNT" ]; then printf '無法取得服務帳戶，停止。\n'; exit 1; fi
gcloud services enable firestore.googleapis.com secretmanager.googleapis.com --project="$PROJECT"
if ! gcloud firestore databases describe --database="$DATABASE" --project="$PROJECT" >/dev/null 2>&1; then
 gcloud firestore databases create --database="$DATABASE" --location="$REGION" --type=firestore-native --delete-protection --project="$PROJECT"
fi
gcloud firestore fields ttls update expiresAt --collection-group=ocrResults --database="$DATABASE" --enable-ttl --project="$PROJECT"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/datastore.user --condition=None >/dev/null
read -r -s -p '設定獨立管理員密碼（至少 32 字元，請自行保存，不要使用原 OCR 使用碼）：' ADMIN_SECRET
printf '\n'
if [ "$(printf %s "$ADMIN_SECRET" | wc -c)" -lt 32 ]; then printf '長度不足，尚未更新服務。\n'; exit 1; fi
if ! gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
 gcloud secrets create "$SECRET" --replication-policy=automatic --project="$PROJECT" >/dev/null
fi
VERSION=$(printf %s "$ADMIN_SECRET" | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT" --format='value(name)' | awk -F/ '{print $NF}')
unset ADMIN_SECRET
gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor --project="$PROJECT" >/dev/null
bash cloud/setup-code-storage.sh
bash cloud/update-service.sh
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
 --update-env-vars="BILLING_ENABLED=true,BILLING_ADMIN_ONLY=true,BILLING_DATABASE=$DATABASE" \
 --update-secrets="OCR_ADMIN_CODE=$SECRET:$VERSION" --quiet
printf '\n後台準備完成：%s/admin.html\n原使用碼仍可用，尚未對客戶扣點。\n' "$URL"
printf '請先建立測試客戶、確認試用 10 點與加點紀錄，再依 cloud/BILLING.md 安排切換。\n'
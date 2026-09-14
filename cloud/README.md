# Google Cloud Vision 線上版

Project: registry-ocr-123456. Frontend and OCR API run together on Cloud Run.
Cloud Run uses its attached service account to obtain a Google access token.
No downloadable Google key or credentials are included in the website.

## Deployment (Google Cloud Shell)

Run bash cloud/deploy.sh from this checkout.
The account running deployment needs permission to enable APIs, create/use a
service account, bind Service Usage Consumer, build and deploy Cloud Run.
Source builds may require the build service account to have Cloud Run Builder;
follow the exact IAM error if the project has stricter build policies.
The script enables Vision, Cloud Run, Cloud Build, Artifact Registry and IAM.
Cloud hosting/build costs are additional to Vision OCR units.

Choose a private OCR access code of at least 16 characters. It protects paid OCR
calls; share it only with intended users. It is NOT a Google API key.
It is kept in the service environment and is never included in public source or
printed by the script. Cloud project administrators can view that configuration.
The deployment URL serves the website. To retain the GitHub Pages frontend,
set window.REGISTRY_OCR_URL in cloud-config.js to that HTTPS URL, then publish.

The frontend only uploads after explicit consent. The backend keeps images and
results in request memory and does not save document contents or log them.
Google processing is governed by its service terms. OCR output needs review.
The Taiwan Cloud Run region does not guarantee that Vision processing stays in Taiwan.

The /api/health endpoint confirms server configuration, not a successful Vision
inference. Verify one authorized sample after deployment before calling it ready.

## Limits

One request accepts one image of up to 7 MiB; each image/crop counts as one Vision
unit. The per-instance limit is 60 authenticated requests per minute.
Max instances is 1, but instance replacement or deployment can reset local limits;
this is not a monthly spending cap. Configure Google API quotas separately.
The access code is a simple shared credential, not per-user account management.

## Verification

node --test cloud/server.test.mjs cloud/frontend.test.mjs
Tests use a fake OCR provider and do not send documents to Google or incur charges.
Actual cloud deployment and a real Vision OCR sample remain necessary.

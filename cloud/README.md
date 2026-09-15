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
unit. There is no application-imposed per-minute OCR request cap.
Google Vision quotas still apply. Max instances is 1;
this is not a monthly spending cap. Configure Google API quotas separately.
The access code is a simple shared credential, not per-user account management.

## Verification

node --test cloud/server.test.mjs cloud/frontend.test.mjs
Tests use a fake OCR provider and do not send documents to Google or incur charges.
Actual cloud deployment and a real Vision OCR sample remain necessary.

## Project-wide Monitoring

The website /api/usage reads serviceruntime.googleapis.com/api/request_count for
consumed_api resources with service vision.googleapis.com, across the project.
No browser storage or documents are used. Service account needs Monitoring Viewer;
Monitoring API must be enabled. Run bash cloud/update-monitoring.sh in Cloud Shell
to enable monitoring and deploy the update while preserving existing environment
variables (including the OCR access code).
The same OCR access code authorizes viewing project totals. Google records can
lag by 30 minutes; the backend caches results for five minutes and the page polls
every five minutes after an authorized manual read.

The dashboard shows UTC month/day request counts. Costs are conditional estimates
based ONLY on successful BatchAnnotateImages RPCs, assuming one image and one
Document Text Detection feature per request, as implemented by this app.
Other clients in the project can violate that assumption, and 2xx RPCs can contain
image-level errors. API request counts must never be presented as billing units
or actual billed cost. Empty series and permission failures remain explicit.
No historical data is fabricated. Invoice/free allowance sharing and other costs
are not known from these metrics. Official references:
https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z#serviceruntime
https://cloud.google.com/vision/pricing

Tests: node --test cloud/*.test.mjs

## Full-document mode and removal of application rate cap

The default frontend mode renders every PDF page to one image, sends each page
sequentially to Google Document Text Detection and uses only that OCR output for
land and owner parsing. Full mode does not additionally upload address crops.
Mixed mode remains optional. Repeating a completed run produces new billable calls.
No guarantee of perfect OCR accuracy is made.

The previous 60 requests/minute application cap has been removed.
Authentication, image validation, file limits and Google quotas remain.
Google 429/RESOURCE_EXHAUSTED responses retain a retryable 429 status;
the frontend performs the existing bounded countdown retries.
Run bash cloud/update-service.sh to update the deployed backend without changing
the access code. Until that finishes, the old backend's 60/minute cap still applies.
Health version: full-page-2026-09-15; appRateLimit: null.

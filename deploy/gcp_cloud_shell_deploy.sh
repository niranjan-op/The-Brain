#!/usr/bin/env bash
set -euo pipefail

# Knowledge Cartographer — Interactive Google Cloud Shell Deploy Script
# Provisions: APIs, Service Accounts, GCS Bucket + HMAC keys, Cloud SQL PG17,
# Secret Manager, Artifact Registry + Cloud Build image, Alembic Migrations Job,
# Cloud Run Worker Job + Cloud Scheduler, and Cloud Run API Service.

if [[ ! -f "main.py" || ! -f "Dockerfile" ]]; then
  echo "ERROR: Run this script from the repository root (where main.py and Dockerfile live)." >&2
  exit 1
fi

banner() {
  echo ""
  echo "========================================================================"
  echo "  $1"
  echo "========================================================================"
}

urlencode() {
  python3 -c "import sys, urllib.parse; print(urllib.parse.quote_plus(sys.argv[1]))" "$1"
}

upsert_secret() {
  local name="$1"
  local value="$2"
  if ! gcloud secrets describe "$name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy="automatic" --project="$GCP_PROJECT_ID" >/dev/null
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$GCP_PROJECT_ID" >/dev/null
  echo "  [secret] $name updated"
}

grant_sa_role() {
  local member="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member="$member" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
}

banner "Stage 1 / 10 — Configuration"

DEFAULT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ -z "$DEFAULT_PROJECT" || "$DEFAULT_PROJECT" == "(unset)" ]]; then
  DEFAULT_PROJECT="cosmograph-e4420"
fi
read -r -p "GCP Project ID [${DEFAULT_PROJECT}]: " GCP_PROJECT_ID
GCP_PROJECT_ID="${GCP_PROJECT_ID:-$DEFAULT_PROJECT}"
if [[ -z "$GCP_PROJECT_ID" ]]; then
  echo "ERROR: GCP Project ID is required." >&2
  exit 1
fi
gcloud config set project "$GCP_PROJECT_ID" >/dev/null

read -r -p "GCP Region [us-central1]: " REGION
REGION="${REGION:-us-central1}"

read -r -p "Firebase Project ID [${GCP_PROJECT_ID}]: " FIREBASE_PROJECT_ID
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-$GCP_PROJECT_ID}"
DEFAULT_FIREBASE_PROJECT="cosmograph-e4420"
read -r -p "Firebase Project ID [${DEFAULT_FIREBASE_PROJECT}]: " FIREBASE_PROJECT_ID
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-$DEFAULT_FIREBASE_PROJECT}"

DEFAULT_BUCKET="kc-uploads-${GCP_PROJECT_ID}"
read -r -p "GCS Bucket Name [${DEFAULT_BUCKET}]: " GCS_BUCKET
GCS_BUCKET="${GCS_BUCKET:-$DEFAULT_BUCKET}"

read -r -p "Allowed CORS_ORIGINS (comma-separated, can update after Vercel deploy) [http://localhost:5173]: " CORS_ORIGINS
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"

read -r -p "LLM Auth Mode — 'vertex' (ADC) or 'apikey' (GEMINI_API_KEY) [vertex]: " LLM_MODE
LLM_MODE="${LLM_MODE:-vertex}"
GEMINI_API_KEY=""
if [[ "$LLM_MODE" == "apikey" ]]; then
  read -r -s -p "Enter GEMINI_API_KEY: " GEMINI_API_KEY
  echo ""
  if [[ -z "$GEMINI_API_KEY" ]]; then
    echo "ERROR: GEMINI_API_KEY cannot be empty when LLM_MODE=apikey." >&2
    exit 1
  fi
fi

read -r -s -p "Optional OPENROUTER_API_KEY (press Enter to skip): " OPENROUTER_API_KEY
echo ""

read -r -p "Optional Neo4j AuraDB URI (press Enter to use Postgres graph fallback): " NEO4J_URI
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD=""
GRAPH_READ_BACKEND="postgres"
if [[ -n "$NEO4J_URI" ]]; then
  read -r -p "Neo4j Username [neo4j]: " INPUT_NEO4J_USER
  NEO4J_USERNAME="${INPUT_NEO4J_USER:-neo4j}"
  read -r -s -p "Neo4j Password: " NEO4J_PASSWORD
  echo ""
  GRAPH_READ_BACKEND="aura"
fi

read -r -p "Create/Use Cloud SQL Postgres 17 instance 'kc-pg'? (y/n) [y]: " USE_CLOUD_SQL
USE_CLOUD_SQL="${USE_CLOUD_SQL:-y}"

CUSTOM_DB_URL=""
if [[ "$USE_CLOUD_SQL" != "y" && "$USE_CLOUD_SQL" != "Y" ]]; then
  read -r -s -p "Enter full Postgres DATABASE_URL (postgresql+psycopg://...): " CUSTOM_DB_URL
  echo ""
  if [[ -z "$CUSTOM_DB_URL" ]]; then
    echo "ERROR: DATABASE_URL is required." >&2
    exit 1
  fi
fi

echo ""
echo "Summary:"
echo "  Project:          $GCP_PROJECT_ID"
echo "  Region:           $REGION"
echo "  Firebase Project: $FIREBASE_PROJECT_ID"
if [[ "$FIREBASE_PROJECT_ID" != "$GCP_PROJECT_ID" ]]; then
  echo "  Auth Note:        Cross-project Firebase ID token verification uses public Google certs (no JSON key required)."
fi
echo "  GCS Bucket:       $GCS_BUCKET"
echo "  LLM Mode:         $LLM_MODE"
echo "  Graph Backend:    $GRAPH_READ_BACKEND"
echo "  Cloud SQL:        $USE_CLOUD_SQL"
read -r -p "Proceed with GCP provisioning and deployment? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

banner "Stage 2 / 10 — Enabling GCP APIs"
BILLING_ENABLED="$(gcloud billing projects describe "$GCP_PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
if [[ "$BILLING_ENABLED" == "False" ]]; then
  echo "ERROR: Billing is not enabled on GCP project '${GCP_PROJECT_ID}'." >&2
  echo "Link a billing account (Blaze plan) at:" >&2
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=${GCP_PROJECT_ID}" >&2
  echo "Or re-run and enter a separate billed GCP Project ID while keeping FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}." >&2
  exit 1
fi

gcloud services enable \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  --project="$GCP_PROJECT_ID"

banner "Stage 3 / 10 — Service Accounts & IAM"
API_SA="kc-api@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="kc-worker@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="kc-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

for sa_name in kc-api kc-worker kc-scheduler; do
  if ! gcloud iam service-accounts describe "${sa_name}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa_name" --display-name="Knowledge Cartographer $sa_name" --project="$GCP_PROJECT_ID"
  fi
done

grant_sa_role "serviceAccount:${API_SA}" "roles/cloudsql.client"
grant_sa_role "serviceAccount:${API_SA}" "roles/secretmanager.secretAccessor"
grant_sa_role "serviceAccount:${API_SA}" "roles/aiplatform.user"
grant_sa_role "serviceAccount:${API_SA}" "roles/run.developer"

grant_sa_role "serviceAccount:${WORKER_SA}" "roles/cloudsql.client"
grant_sa_role "serviceAccount:${WORKER_SA}" "roles/secretmanager.secretAccessor"
grant_sa_role "serviceAccount:${WORKER_SA}" "roles/aiplatform.user"

grant_sa_role "serviceAccount:${SCHED_SA}" "roles/run.invoker"

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
if gcloud iam service-accounts describe "$COMPUTE_SA" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  grant_sa_role "serviceAccount:${COMPUTE_SA}" "roles/cloudbuild.builds.builder"
  grant_sa_role "serviceAccount:${COMPUTE_SA}" "roles/artifactregistry.writer"
  grant_sa_role "serviceAccount:${COMPUTE_SA}" "roles/logging.logWriter"
fi

banner "Stage 4 / 10 — GCS Bucket & HMAC Keys"
if ! gcloud storage buckets describe "gs://${GCS_BUCKET}" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${GCS_BUCKET}" --location="$REGION" --uniform-bucket-level-access --project="$GCP_PROJECT_ID"
fi
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${API_SA}" --role="roles/storage.objectAdmin" --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${WORKER_SA}" --role="roles/storage.objectAdmin" --quiet >/dev/null

if gcloud secrets describe "kc-s3-access-key" --project="$GCP_PROJECT_ID" >/dev/null 2>&1 && \
   gcloud secrets describe "kc-s3-secret-key" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "  [hmac] Reusing existing kc-s3-access-key / kc-s3-secret-key in Secret Manager."
else
  HMAC_JSON="$(gcloud storage hmac create "$API_SA" --project="$GCP_PROJECT_ID" --format=json)"
  S3_ACCESS_KEY="$(python3 -c "import json,sys; print(json.load(sys.stdin)['metadata']['accessId'])" <<<"$HMAC_JSON")"
  S3_SECRET_KEY="$(python3 -c "import json,sys; print(json.load(sys.stdin)['secret'])" <<<"$HMAC_JSON")"
  upsert_secret "kc-s3-access-key" "$S3_ACCESS_KEY"
  upsert_secret "kc-s3-secret-key" "$S3_SECRET_KEY"
fi

banner "Stage 5 / 10 — Cloud SQL Postgres 17"
SQL_INSTANCE="kc-pg"
SQL_CONN_NAME=""
if [[ "$USE_CLOUD_SQL" == "y" || "$USE_CLOUD_SQL" == "Y" ]]; then
  if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    echo "  Creating Cloud SQL Postgres 17 instance '$SQL_INSTANCE' (this takes ~5-10 minutes)..."
    gcloud sql instances create "$SQL_INSTANCE" \
      --database-version=POSTGRES_17 \
      --edition=ENTERPRISE \
      --tier=db-custom-1-3840 \
      --region="$REGION" \
      --database-flags=cloudsql.enable_pg_textsearch=on \
      --backup-start-time=03:00 \
      --project="$GCP_PROJECT_ID"
  else
    echo "  Cloud SQL instance '$SQL_INSTANCE' already exists; ensuring activation-policy=ALWAYS..."
    gcloud sql instances patch "$SQL_INSTANCE" --activation-policy=ALWAYS --project="$GCP_PROJECT_ID" --quiet
  fi

  SQL_CONN_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$GCP_PROJECT_ID" --format='value(connectionName)')"

  if ! gcloud sql databases describe appdb --instance="$SQL_INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud sql databases create appdb --instance="$SQL_INSTANCE" --project="$GCP_PROJECT_ID"
  fi

  if gcloud secrets describe "kc-database-url" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    echo "  Reusing existing kc-database-url secret."
  else
    DB_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
    if gcloud sql users list --instance="$SQL_INSTANCE" --project="$GCP_PROJECT_ID" --format='value(name)' | grep -qx 'kc_app'; then
      gcloud sql users set-password kc_app --instance="$SQL_INSTANCE" --password="$DB_PASS" --project="$GCP_PROJECT_ID"
    else
      gcloud sql users create kc_app --instance="$SQL_INSTANCE" --password="$DB_PASS" --project="$GCP_PROJECT_ID"
    fi
    ENC_PASS="$(urlencode "$DB_PASS")"
    DB_URL="postgresql+psycopg://kc_app:${ENC_PASS}@/appdb?host=/cloudsql/${SQL_CONN_NAME}"
    upsert_secret "kc-database-url" "$DB_URL"
  fi
  KEYWORD_ENGINE="bm25"
else
  upsert_secret "kc-database-url" "$CUSTOM_DB_URL"
  KEYWORD_ENGINE="tsvector"
fi

banner "Stage 6 / 10 — Secret Manager"
SECRETS_ARG="DATABASE_URL=kc-database-url:latest,S3_ACCESS_KEY=kc-s3-access-key:latest,S3_SECRET_KEY=kc-s3-secret-key:latest"

if [[ -n "$GEMINI_API_KEY" ]]; then
  upsert_secret "kc-gemini-api-key" "$GEMINI_API_KEY"
  SECRETS_ARG="${SECRETS_ARG},GEMINI_API_KEY=kc-gemini-api-key:latest"
fi
if [[ -n "$OPENROUTER_API_KEY" ]]; then
  upsert_secret "kc-openrouter-api-key" "$OPENROUTER_API_KEY"
  SECRETS_ARG="${SECRETS_ARG},OPENROUTER_API_KEY=kc-openrouter-api-key:latest"
fi
if [[ -n "$NEO4J_PASSWORD" ]]; then
  upsert_secret "kc-neo4j-password" "$NEO4J_PASSWORD"
  SECRETS_ARG="${SECRETS_ARG},NEO4J_PASSWORD=kc-neo4j-password:latest"
fi

banner "Stage 7 / 10 — Build & Push Container Image (Cloud Build)"
AR_REPO="kc"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Knowledge Cartographer container images" \
    --project="$GCP_PROJECT_ID"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO}/backend:latest"
gcloud builds submit --tag "$IMAGE_URI" --project="$GCP_PROJECT_ID" .

CLOUDSQL_JOB_FLAGS=()
CLOUDSQL_SVC_FLAGS=()
if [[ -n "$SQL_CONN_NAME" ]]; then
  CLOUDSQL_JOB_FLAGS=(--set-cloudsql-instances="$SQL_CONN_NAME")
  CLOUDSQL_SVC_FLAGS=(--add-cloudsql-instances="$SQL_CONN_NAME")
fi

banner "Stage 8 / 10 — Run Alembic Database Migrations"
gcloud run jobs deploy kc-migrate \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$GCP_PROJECT_ID" \
  --service-account="$WORKER_SA" \
  --command=alembic \
  --args=upgrade,head \
  --max-retries=0 \
  --task-timeout=600 \
  --memory=1Gi \
  --cpu=1 \
  --set-secrets="DATABASE_URL=kc-database-url:latest" \
  "${CLOUDSQL_JOB_FLAGS[@]}"

gcloud run jobs execute kc-migrate --region="$REGION" --project="$GCP_PROJECT_ID" --wait

banner "Stage 9 / 10 — Deploy Worker Job & Cloud Scheduler"
COMMON_ENV="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}@S3_ENDPOINT=https://storage.googleapis.com@S3_BUCKET=${GCS_BUCKET}@KEYWORD_ENGINE=${KEYWORD_ENGINE}@GRAPH_READ_BACKEND=${GRAPH_READ_BACKEND}@RUN_LOCAL_WORKERS=false"
if [[ "$LLM_MODE" == "vertex" ]]; then
  COMMON_ENV="${COMMON_ENV}@GOOGLE_GENAI_USE_VERTEXAI=true@GOOGLE_CLOUD_PROJECT=${GCP_PROJECT_ID}@GOOGLE_CLOUD_LOCATION=global"
fi
if [[ -n "$NEO4J_URI" ]]; then
  COMMON_ENV="${COMMON_ENV}@NEO4J_URI=${NEO4J_URI}@NEO4J_USERNAME=${NEO4J_USERNAME}"
fi

WORKER_ENV="^@^${COMMON_ENV}@DB_POOL_SIZE=2@DB_MAX_OVERFLOW=0@WORKER_CONCURRENCY=1"

gcloud run jobs deploy kc-worker \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$GCP_PROJECT_ID" \
  --service-account="$WORKER_SA" \
  --command=python \
  --args=-m,src.kc.worker \
  --max-retries=0 \
  --task-timeout=3600 \
  --memory=8Gi \
  --cpu=4 \
  --parallelism=1 \
  --set-secrets="$SECRETS_ARG" \
  --set-env-vars="$WORKER_ENV" \
  "${CLOUDSQL_JOB_FLAGS[@]}"

SCHED_URI="https://run.googleapis.com/v2/projects/${GCP_PROJECT_ID}/locations/${REGION}/jobs/kc-worker:run"
if gcloud scheduler jobs describe kc-worker-tick --location="$REGION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud scheduler jobs update http kc-worker-tick \
    --location="$REGION" \
    --project="$GCP_PROJECT_ID" \
    --schedule="*/5 * * * *" \
    --uri="$SCHED_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
else
  gcloud scheduler jobs create http kc-worker-tick \
    --location="$REGION" \
    --project="$GCP_PROJECT_ID" \
    --schedule="*/5 * * * *" \
    --uri="$SCHED_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
fi

banner "Stage 10 / 10 — Deploy API Service & Smoke Test"
API_ENV="^@^${COMMON_ENV}@QUEUE_DISPATCHER=cloudrun@CLOUD_RUN_PROJECT=${GCP_PROJECT_ID}@CLOUD_RUN_REGION=${REGION}@CLOUD_RUN_JOB_NAME=kc-worker@DB_POOL_SIZE=5@DB_MAX_OVERFLOW=2@CORS_ORIGINS=${CORS_ORIGINS}"

gcloud run deploy kc-api \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$GCP_PROJECT_ID" \
  --service-account="$API_SA" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=4Gi \
  --cpu=2 \
  --max-instances=1 \
  --no-cpu-throttling \
  --set-secrets="$SECRETS_ARG" \
  --set-env-vars="$API_ENV" \
  "${CLOUDSQL_SVC_FLAGS[@]}"

API_URL="$(gcloud run services describe kc-api --region="$REGION" --project="$GCP_PROJECT_ID" --format='value(status.url)')"

echo "  Testing ${API_URL}/healthz ..."
curl -fsS "${API_URL}/healthz"
echo ""

banner "Deployment Complete"
echo "Backend API URL: $API_URL"
echo ""
echo "Next steps:"
echo "  1. Deploy frontend/ to Vercel with:"
echo "       VITE_API_BASE_URL=${API_URL}"
echo "       VITE_FIREBASE_API_KEY=<your-firebase-web-api-key>"
echo "       VITE_FIREBASE_AUTH_DOMAIN=<your-firebase-auth-domain>"
echo "       VITE_FIREBASE_AUTH_DOMAIN=${FIREBASE_PROJECT_ID}.firebaseapp.com"
echo "       VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
echo "  2. Update CORS_ORIGINS on kc-api with your Vercel URL:"
echo "       gcloud run services update kc-api --region=${REGION} --project=${GCP_PROJECT_ID} --update-env-vars=\"^@^CORS_ORIGINS=https://YOUR_APP.vercel.app\""
echo "  3. Add your Vercel domain in Firebase Console -> Authentication -> Settings -> Authorized domains."
if [[ -n "$SQL_CONN_NAME" ]]; then
  echo ""
  echo "Credit-saving tip (pause/resume Cloud SQL when idle):"
  echo "  Pause:  gcloud sql instances patch ${SQL_INSTANCE} --activation-policy=NEVER --project=${GCP_PROJECT_ID}"
  echo "  Resume: gcloud sql instances patch ${SQL_INSTANCE} --activation-policy=ALWAYS --project=${GCP_PROJECT_ID}"
fi

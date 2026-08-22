#!/usr/bin/env bash
# deploy-rendezvous-to-gcp.sh — SweK Engine cloud rendezvous deployer
#
# USAGE
#   ./deploy-rendezvous-to-gcp.sh              # Cloud Run (recommended, no persistent board state)
#   ./deploy-rendezvous-to-gcp.sh --gcs-fuse   # Cloud Run + GCS bucket mounted at /mnt/state (board state survives redeploys)
#   ./deploy-rendezvous-to-gcp.sh --vm         # always-free e2-micro VM (board state on persistent disk, stable IP)
#   ./deploy-rendezvous-to-gcp.sh --e2         # alias for --vm
#
# PREREQUISITES (all paths)
#   - gcloud CLI installed and authenticated:  gcloud auth login
#   - Active project set:                      gcloud config set project YOUR_PROJECT
#   - Billing enabled (required for Cloud Run and VM; free-tier applies)
#
# CLOUD RUN path also needs:
#   - Cloud Run API enabled (the script enables it automatically)
#   - Cloud Build API enabled (used by --source deploy; script enables it)
#
# GCS FUSE path additionally needs:
#   - Cloud Storage API (script enables it)
#   - The Cloud Run service account needs storage.objectAdmin on the bucket (script grants it)
#
# VM path additionally needs:
#   - Compute Engine API (script enables it)
#   - An SSH key in ~/.ssh/id_rsa.pub (or set SSH_PUB_KEY_FILE env var)
#
# ENV OVERRIDES (all optional — script prompts for SWEK_TOKEN if unset)
#   SWEK_TOKEN         shared secret for the rendezvous server (prompted if empty)
#   GCP_REGION         Cloud Run region or VM zone prefix  (default: us-central1)
#   GCP_ZONE           VM zone                             (default: us-central1-a)
#   SERVICE_NAME       Cloud Run service name              (default: swek-rendezvous)
#   VM_NAME            Compute VM instance name            (default: swek-rv)
#   GCS_BUCKET         GCS bucket name for --gcs-fuse      (default: swek-rv-state-<project>)
#   SSH_PUB_KEY_FILE   path to SSH public key for VM       (default: ~/.ssh/id_rsa.pub)
#   SSH_USER           SSH username for VM                  (default: $USER or swek)

set -euo pipefail

# ── colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLD='\033[1m'; RST='\033[0m'
info()  { echo -e "${GRN}[swek-deploy]${RST} $*"; }
warn()  { echo -e "${YLW}[swek-deploy]${RST} $*"; }
fatal() { echo -e "${RED}[swek-deploy] FATAL:${RST} $*" >&2; exit 1; }
hr()    { echo -e "${BLD}────────────────────────────────────────────────────────${RST}"; }

# ── parse flags ───────────────────────────────────────────────────────────────
MODE="cloudrun"   # cloudrun | cloudrun-gcs | vm
for arg in "$@"; do
  case "$arg" in
    --gcs-fuse) MODE="cloudrun-gcs" ;;
    --vm|--e2)  MODE="vm" ;;
    --help|-h)
      sed -n '2,30p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) fatal "Unknown flag: $arg  (run with --help for usage)" ;;
  esac
done

# ── locate the rendezvous source dir ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$SCRIPT_DIR/cloud/swek-rendezvous"
[[ -f "$SRC/server.js" ]] || fatal "Cannot find cloud/swek-rendezvous/server.js relative to this script."

# ── check gcloud is present and authenticated ─────────────────────────────────
command -v gcloud &>/dev/null || fatal "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
[[ -n "$ACCOUNT" && "$ACCOUNT" != "(unset)" ]] || fatal "Not logged in. Run:  gcloud auth login"
PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
[[ -n "$PROJECT" && "$PROJECT" != "(unset)" ]] || fatal "No project set. Run:  gcloud config set project YOUR_PROJECT_ID"
info "Account : $ACCOUNT"
info "Project : $PROJECT"

# ── token ─────────────────────────────────────────────────────────────────────
if [[ -z "${SWEK_TOKEN:-}" ]]; then
  echo -en "${YLW}[swek-deploy]${RST} Enter SWEK_TOKEN (shared secret, input hidden): "
  read -rs SWEK_TOKEN; echo
fi
[[ -n "$SWEK_TOKEN" ]] || fatal "SWEK_TOKEN cannot be empty."

# ── defaults ──────────────────────────────────────────────────────────────────
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
SERVICE_NAME="${SERVICE_NAME:-swek-rendezvous}"
VM_NAME="${VM_NAME:-swek-rv}"
GCS_BUCKET="${GCS_BUCKET:-swek-rv-state-$PROJECT}"
SSH_USER="${SSH_USER:-${USER:-swek}}"
SSH_PUB_KEY_FILE="${SSH_PUB_KEY_FILE:-$HOME/.ssh/id_rsa.pub}"

hr
case "$MODE" in
  cloudrun)     info "MODE: Cloud Run (source deploy, ephemeral state)" ;;
  cloudrun-gcs) info "MODE: Cloud Run + GCS FUSE volume (persistent board state)" ;;
  vm)           info "MODE: always-free e2-micro VM (persistent disk, stable IP)" ;;
esac
hr

# ══════════════════════════════════════════════════════════════════════════════
# PATH A — Cloud Run (plain, no persistent volume)
# ══════════════════════════════════════════════════════════════════════════════
deploy_cloudrun() {
  info "Enabling required APIs (run, cloudbuild) …"
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
    --project="$PROJECT" --quiet

  info "Deploying to Cloud Run from source …"
  info "  service  : $SERVICE_NAME"
  info "  region   : $REGION"
  info "  source   : $SRC"
  warn "Board state is ephemeral — it will reset on container redeploy."
  warn "Use --gcs-fuse to persist the board across redeploys."

  gcloud run deploy "$SERVICE_NAME" \
    --source "$SRC" \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances=1 \
    --max-instances=1 \
    --set-env-vars "SWEK_TOKEN=$SWEK_TOKEN" \
    --project="$PROJECT" \
    --quiet

  _print_cloudrun_result
}

# ══════════════════════════════════════════════════════════════════════════════
# PATH B — Cloud Run + GCS FUSE persistent volume
# ══════════════════════════════════════════════════════════════════════════════
deploy_cloudrun_gcs() {
  info "Enabling required APIs (run, cloudbuild, storage) …"
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com storage.googleapis.com \
    --project="$PROJECT" --quiet

  # Create the bucket if it doesn't exist (standard storage, same region)
  if ! gsutil ls -b "gs://$GCS_BUCKET" &>/dev/null; then
    info "Creating GCS bucket gs://$GCS_BUCKET in $REGION …"
    gcloud storage buckets create "gs://$GCS_BUCKET" \
      --location="$REGION" \
      --default-storage-class=STANDARD \
      --project="$PROJECT" --quiet
  else
    info "Bucket gs://$GCS_BUCKET already exists — reusing."
  fi

  # Derive the Cloud Run service account (PROJECT_NUMBER-compute@developer.gserviceaccount.com)
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  info "Granting storage.objectAdmin to Cloud Run SA: $SA …"
  gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
    --member="serviceAccount:$SA" \
    --role="roles/storage.objectAdmin" \
    --project="$PROJECT" --quiet

  info "Deploying to Cloud Run (GCS FUSE volume at /mnt/state) …"
  info "  service  : $SERVICE_NAME"
  info "  region   : $REGION"
  info "  bucket   : gs://$GCS_BUCKET"

  # gcloud run deploy --add-volume / --add-volume-mount syntax (GA as of gcloud 458+)
  gcloud run deploy "$SERVICE_NAME" \
    --source "$SRC" \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances=1 \
    --max-instances=1 \
    --execution-environment=gen2 \
    --set-env-vars "SWEK_TOKEN=$SWEK_TOKEN,SWEK_STATE_DIR=/mnt/state" \
    --add-volume "name=state-vol,type=cloud-storage,bucket=$GCS_BUCKET" \
    --add-volume-mount "volume=state-vol,mount-path=/mnt/state" \
    --project="$PROJECT" \
    --quiet

  info "Board state will persist in gs://$GCS_BUCKET/rendezvous-state.json across redeploys."
  _print_cloudrun_result
}

_print_cloudrun_result() {
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
    --region "$REGION" --project "$PROJECT" \
    --format='value(status.url)' 2>/dev/null || true)"

  hr
  if [[ -n "$SERVICE_URL" ]]; then
    info "Deployed: $SERVICE_URL"
    echo
    echo -e "${BLD}Health check:${RST}"
    echo "  curl $SERVICE_URL/health"
    echo
    echo -e "${BLD}Paste into SweK Engine → Cloud & Hosting → Cloud / Rendezvous:${RST}"
    echo "  URL   : $SERVICE_URL"
    echo "  Token : (the SWEK_TOKEN you entered)"
    echo
    warn "Token is NOT printed here — you know what you set."
  else
    warn "Deploy command finished but could not fetch service URL."
    warn "Run:  gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)'"
  fi
  hr
}

# ══════════════════════════════════════════════════════════════════════════════
# PATH C — always-free e2-micro VM
# ══════════════════════════════════════════════════════════════════════════════
deploy_vm() {
  info "Enabling Compute Engine API …"
  gcloud services enable compute.googleapis.com --project="$PROJECT" --quiet

  # Validate SSH key
  if [[ ! -f "$SSH_PUB_KEY_FILE" ]]; then
    warn "SSH public key not found at $SSH_PUB_KEY_FILE"
    warn "Set SSH_PUB_KEY_FILE env var or generate a key:  ssh-keygen -t rsa -b 4096"
    fatal "Cannot continue without an SSH public key."
  fi

  # Create VM if it doesn't exist
  if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" &>/dev/null 2>&1; then
    warn "VM $VM_NAME already exists in zone $ZONE — skipping creation."
    warn "To recreate it, run:  gcloud compute instances delete $VM_NAME --zone=$ZONE"
  else
    info "Creating e2-micro VM: $VM_NAME in $ZONE …"
    warn "Always-free tier: e2-micro + standard disk + us-central1/us-east1/us-west1 = \$0/mo."
    warn "The gcloud monthly estimate panel shows list price and does NOT subtract the free tier."

    gcloud compute instances create "$VM_NAME" \
      --project="$PROJECT" \
      --zone="$ZONE" \
      --machine-type=e2-micro \
      --image-family=debian-12 \
      --image-project=debian-cloud \
      --boot-disk-type=pd-standard \
      --boot-disk-size=30GB \
      --tags=swek-rv \
      --metadata-from-file "ssh-keys=<(echo "$SSH_USER:$(cat "$SSH_PUB_KEY_FILE")")" \
      --quiet
    info "VM created."
  fi

  # Open firewall for port 8787 if rule doesn't exist
  if ! gcloud compute firewall-rules describe swek-rv-http --project="$PROJECT" &>/dev/null 2>&1; then
    info "Creating firewall rule: tcp:8787 → tag swek-rv …"
    gcloud compute firewall-rules create swek-rv-http \
      --project="$PROJECT" \
      --allow=tcp:8787 \
      --target-tags=swek-rv \
      --quiet
  else
    info "Firewall rule swek-rv-http already exists — skipping."
  fi

  # Get external IP
  EXT_IP=""
  for i in 1 2 3 4 5; do
    EXT_IP="$(gcloud compute instances describe "$VM_NAME" \
      --zone="$ZONE" --project="$PROJECT" \
      --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || true)"
    [[ -n "$EXT_IP" ]] && break
    sleep 3
  done
  [[ -n "$EXT_IP" ]] || fatal "Could not retrieve external IP after 5 attempts. Check the Cloud Console."

  info "VM external IP: $EXT_IP"

  # Build the startup script to run on the VM via SSH
  # We scp the rendezvous source, install Node, write systemd unit, start it.
  info "Waiting 20s for VM SSH to become available …"
  sleep 20

  info "Copying rendezvous source to VM …"
  gcloud compute scp --recurse "$SRC" \
    "${SSH_USER}@${VM_NAME}:/home/${SSH_USER}/swek-rendezvous" \
    --zone="$ZONE" --project="$PROJECT" --quiet

  info "Installing Node.js + writing systemd service on VM …"
  # Escape the token safely for the heredoc
  ESCAPED_TOKEN="${SWEK_TOKEN//\'/\'\\\'\'}"
  gcloud compute ssh "${SSH_USER}@${VM_NAME}" \
    --zone="$ZONE" --project="$PROJECT" --quiet \
    --command="
      set -e
      # Install Node 20 (NodeSource)
      if ! command -v node &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
      fi
      node --version

      # Write systemd unit
      sudo tee /etc/systemd/system/swek-rv.service > /dev/null <<'UNIT'
[Unit]
Description=SweK Engine rendezvous server
After=network.target

[Service]
Type=simple
User=$SSH_USER
WorkingDirectory=/home/$SSH_USER/swek-rendezvous
Environment=PORT=8787
Environment=SWEK_TOKEN=$ESCAPED_TOKEN
ExecStart=/usr/bin/node /home/$SSH_USER/swek-rendezvous/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

      sudo systemctl daemon-reload
      sudo systemctl enable swek-rv
      sudo systemctl restart swek-rv
      sleep 2
      sudo systemctl status swek-rv --no-pager
    "

  hr
  info "VM deployment complete."
  echo
  echo -e "${BLD}Health check (from your machine):${RST}"
  echo "  curl http://$EXT_IP:8787/health"
  echo
  echo -e "${BLD}SSH to manage the VM:${RST}"
  echo "  gcloud compute ssh ${SSH_USER}@${VM_NAME} --zone=$ZONE"
  echo "  sudo journalctl -u swek-rv -f   # tail logs"
  echo "  sudo systemctl restart swek-rv  # restart after file edits"
  echo
  echo -e "${BLD}Paste into SweK Engine → Cloud & Hosting → Cloud / Rendezvous:${RST}"
  echo "  URL   : http://$EXT_IP:8787"
  echo "  Token : (the SWEK_TOKEN you entered)"
  echo
  warn "The VM has a stable IP but no TLS. For HTTPS, put it behind a Cloud Load Balancer"
  warn "or run Cloudflare Tunnel on the VM: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
  warn "Token is NOT printed here — you know what you set."
  hr
}

# ── dispatch ──────────────────────────────────────────────────────────────────
case "$MODE" in
  cloudrun)     deploy_cloudrun ;;
  cloudrun-gcs) deploy_cloudrun_gcs ;;
  vm)           deploy_vm ;;
esac

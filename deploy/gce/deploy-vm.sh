#!/usr/bin/env bash
# ==============================================================================
# Z2G - Google Compute Engine Automated Deployment Script
# Provisions a 24/7 GCE VM instance, configures networking, syncs code,
# and starts the production migration engine under systemd supervision.
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "${GREEN}${BOLD}     🚀 DEPLOY Z2G TO GOOGLE CLOUD COMPUTE ENGINE (GCE) 🚀${NC}"
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo ""

# 1. Verify gcloud CLI is available
if ! command -v gcloud >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Google Cloud SDK (gcloud) is not installed!${NC}"
  echo -e "Install gcloud or run this command directly inside Google Cloud Shell:"
  echo -e "  ${CYAN}https://shell.cloud.google.com${NC}"
  exit 1
fi

# 2. Project & Configuration
GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "")}"
if [ -z "$GCP_PROJECT" ] || [ "$GCP_PROJECT" = "(unset)" ]; then
  echo -e "${YELLOW}Please enter your Google Cloud Project ID:${NC}"
  read -r GCP_PROJECT
  gcloud config set project "$GCP_PROJECT"
fi

INSTANCE_NAME="${INSTANCE_NAME:-z2g-migration-engine}"
ZONE="${ZONE:-asia-southeast2-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
BOOT_DISK_SIZE="${BOOT_DISK_SIZE:-50GB}"
NETWORK_TAG="z2g-server"

echo -e "Target Project:      ${GREEN}${GCP_PROJECT}${NC}"
echo -e "Target VM Instance:  ${GREEN}${INSTANCE_NAME}${NC}"
echo -e "Target Zone:         ${GREEN}${ZONE}${NC}"
echo -e "Machine Type:        ${GREEN}${MACHINE_TYPE} (4 vCPUs, 16 GB RAM)${NC}"
echo -e "Boot Disk:           ${GREEN}${BOOT_DISK_SIZE} Balanced SSD${NC}"
echo ""

# 3. Create Firewall Rule if it doesn't exist
FIREWALL_RULE_NAME="allow-z2g-web"
echo -e "${CYAN}Checking VPC firewall rules...${NC}"
if ! gcloud compute firewall-rules describe "$FIREWALL_RULE_NAME" --project="$GCP_PROJECT" >/dev/null 2>&1; then
  echo -e "${YELLOW}Creating firewall rule '$FIREWALL_RULE_NAME' for HTTP (:80) and App (:3000)...${NC}"
  gcloud compute firewall-rules create "$FIREWALL_RULE_NAME" \
    --project="$GCP_PROJECT" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80,tcp:443,tcp:3000 \
    --source-ranges=0.0.0.0/0 \
    --target-tags="$NETWORK_TAG"
  echo -e "${GREEN}✓ Firewall rule created.${NC}"
else
  echo -e "${GREEN}✓ Firewall rule '$FIREWALL_RULE_NAME' already exists.${NC}"
fi

# 4. Check if VM already exists
echo -e "${CYAN}Checking if VM '$INSTANCE_NAME' exists in zone '$ZONE'...${NC}"
if gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$GCP_PROJECT" >/dev/null 2>&1; then
  echo -e "${YELLOW}! Instance '$INSTANCE_NAME' already exists.${NC}"
else
  echo -e "${CYAN}Creating Compute Engine instance '$INSTANCE_NAME'...${NC}"
  gcloud compute instances create "$INSTANCE_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family="debian-12" \
    --image-project="debian-cloud" \
    --boot-disk-size="$BOOT_DISK_SIZE" \
    --boot-disk-type="pd-balanced" \
    --tags="http-server,https-server,$NETWORK_TAG" \
    --metadata-from-file="startup-script=${SCRIPT_DIR}/startup-script.sh" \
    --scopes="cloud-platform"
  echo -e "${GREEN}✓ Compute Engine instance created successfully!${NC}"
fi

# 5. Fetch External IP
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" \
  --project="$GCP_PROJECT" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo -e "VM External IP: ${GREEN}${BOLD}${EXTERNAL_IP}${NC}"
echo ""

# 6. Wait for SSH availability
echo -e "${CYAN}Waiting for VM to initialize SSH connectivity...${NC}"
for i in {1..30}; do
  if gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$GCP_PROJECT" --command="true" --quiet 2>/dev/null; then
    echo -e "${GREEN}✓ SSH connection ready!${NC}"
    break
  fi
  echo -n "."
  sleep 3
done

# 7. Upload Project Code and Migration Data
echo ""
echo -e "${CYAN}Syncing project codebase and migration ledger to the VM (/opt/z2g)...${NC}"

# Create a clean archive to transfer
TMP_ARCHIVE="/tmp/z2g-deploy-payload.tar.gz"
echo "Creating deployment payload archive..."
tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    -czf "$TMP_ARCHIVE" -C "$PROJECT_ROOT" .

echo "Uploading deployment archive via gcloud compute scp..."
gcloud compute scp "$TMP_ARCHIVE" "${INSTANCE_NAME}:/tmp/z2g-deploy-payload.tar.gz" --zone="$ZONE" --project="$GCP_PROJECT" --quiet

echo "Extracting payload into /opt/z2g on the VM..."
gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$GCP_PROJECT" --quiet --command="
  sudo mkdir -p /opt/z2g && \
  sudo tar -xzf /tmp/z2g-deploy-payload.tar.gz -C /opt/z2g && \
  sudo rm -f /tmp/z2g-deploy-payload.tar.gz && \
  cd /opt/z2g && \
  if [ -f z2g-migration-data.tar.gz ] && [ ! -f data/migration.db ]; then
    sudo tar -xzf z2g-migration-data.tar.gz
  fi && \
  echo 'Starting build and service launch...' && \
  sudo npm install && \
  sudo npm run build && \
  sudo systemctl restart z2g && \
  sudo systemctl restart nginx
"
rm -f "$TMP_ARCHIVE"

echo ""
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "${GREEN}${BOLD}   🎉 Z2G IS LIVE ON GOOGLE CLOUD COMPUTE ENGINE! 🎉${NC}"
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo ""
echo -e "Dashboard URL:     ${GREEN}${BOLD}http://${EXTERNAL_IP}${NC}"
echo -e "Direct App Port:   ${CYAN}http://${EXTERNAL_IP}:3000${NC}"
echo -e "SSH to VM:         ${YELLOW}gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}${NC}"
echo -e "Live Logs:         ${YELLOW}gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE} --command='sudo journalctl -u z2g -f'${NC}"
echo ""
echo -e "${GREEN}Open http://${EXTERNAL_IP} in your browser to monitor or resume the migration 24/7!${NC}"

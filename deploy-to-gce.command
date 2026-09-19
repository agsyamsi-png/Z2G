#!/usr/bin/env bash
# ==============================================================================
# Z2G - 1-Click Google Cloud Compute Engine Deployment
# Double-click this file in Finder to launch Z2G on Google Cloud Compute Engine!
# ==============================================================================

set -e

# Strip macOS quarantine flags automatically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
xattr -cr "$SCRIPT_DIR" 2>/dev/null || true

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

clear
echo ""
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "${GREEN}${BOLD}     🚀 1-CLICK Z2G GOOGLE CLOUD COMPUTE ENGINE LAUNCHER 🚀${NC}"
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo ""

# 1. Check if gcloud CLI is installed
if ! command -v gcloud >/dev/null 2>&1; then
  echo -e "${YELLOW}Google Cloud SDK (gcloud) is not detected on this Mac.${NC}"
  echo ""
  echo -e "Would you like to:"
  echo -e "  ${BOLD}1)${NC} Open Google Cloud Shell (Instant 1-Click in Browser, No Installation Required) [Recommended]"
  echo -e "  ${BOLD}2)${NC} Install gcloud CLI on this Mac via Homebrew"
  echo ""
  read -p "Select option (1 or 2) [default: 1]: " OPTION
  OPTION="${OPTION:-1}"

  if [ "$OPTION" = "1" ]; then
    echo -e "${CYAN}Opening Google Cloud Shell in your default browser...${NC}"
    # Open Google Cloud Shell with repository pre-cloned
    open "https://shell.cloud.google.com/?show=terminal" 2>/dev/null || echo "Open: https://shell.cloud.google.com"
    echo ""
    echo -e "${GREEN}${BOLD}Paste this command into your Google Cloud Shell terminal:${NC}"
    echo -e "${YELLOW}git clone https://github.com/agsyamsi-png/Z2G.git && cd Z2G && ./deploy-gce.sh${NC}"
    echo ""
    read -p "Press [Enter] to exit..."
    exit 0
  else
    if command -v brew >/dev/null 2>&1; then
      echo -e "${CYAN}Installing google-cloud-sdk via Homebrew...${NC}"
      brew install --cask google-cloud-sdk
      source "$(brew --prefix)/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc" 2>/dev/null || true
    else
      echo -e "${RED}Homebrew not found. Please install gcloud from https://cloud.google.com/sdk/docs/install${NC}"
      read -p "Press [Enter] to exit..."
      exit 1
    fi
  fi
fi

# 2. Check gcloud authentication
CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
if [ -z "$CURRENT_ACCOUNT" ]; then
  echo -e "${YELLOW}No active Google Cloud login detected. Initiating browser login...${NC}"
  gcloud auth login
fi

echo -e "Authenticated as: ${GREEN}$(gcloud auth list --filter=status:ACTIVE --format='value(account)')${NC}"

# 3. Run the automated deployment script
./deploy/gce/deploy-vm.sh

echo ""
read -p "Deployment completed! Press [Enter] to close this window..."

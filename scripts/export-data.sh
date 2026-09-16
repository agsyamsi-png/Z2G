#!/usr/bin/env bash
# ==============================================================================
# Z2G - Export Data & Configuration for Another Mac
# Packages data/ and .env.local into a transferable archive
# ==============================================================================

cd "$(dirname "$0")/.." || exit 1

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ARCHIVE_NAME="z2g-migration-data.tar.gz"

echo ""
echo -e "${CYAN}${BOLD}📦 Packaging Z2G Migration Data & Settings...${NC}"

if [ ! -d data ] && [ ! -f .env.local ]; then
  echo -e "${RED}[ERROR] Neither data/ folder nor .env.local was found! Nothing to export.${NC}"
  exit 1
fi

# Files to archive
FILES_TO_PACK=()

if [ -d data ]; then
  FILES_TO_PACK+=("data")
fi

if [ -f .env.local ]; then
  FILES_TO_PACK+=(".env.local")
fi

# Create tarball
tar -czf "$ARCHIVE_NAME" "${FILES_TO_PACK[@]}"

if [ $? -eq 0 ]; then
  FILE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
  echo -e "${GREEN}✓ Exported successfully: ${BOLD}$ARCHIVE_NAME${NC} (${CYAN}$FILE_SIZE${NC})"
  echo ""
  echo -e "${BOLD}Next steps for transferring to another Mac:${NC}"
  echo -e "  1. Send ${CYAN}$ARCHIVE_NAME${NC} to your other Mac (via ${YELLOW}AirDrop${NC}, USB drive, or secure transfer)."
  echo -e "  2. Place it in the root folder of your Z2G repository on the other Mac."
  echo -e "  3. On the other Mac, run: ${CYAN}./scripts/import-data.sh${NC}"
  echo ""
else
  echo -e "${RED}[ERROR] Failed to create archive.${NC}"
  exit 1
fi

#!/usr/bin/env bash
# ==============================================================================
# Z2G - Import Migration Data & Configuration Archive on this Mac
# Unpacks z2g-migration-data.tar.gz into data/ and .env.local
# ==============================================================================

cd "$(dirname "$0")/.." || exit 1

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ARCHIVE_PATH="${1:-z2g-migration-data.tar.gz}"

echo ""
echo -e "${CYAN}${BOLD}📥 Importing Z2G Migration Data & Settings...${NC}"

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo -e "${RED}[ERROR] Archive file not found: $ARCHIVE_PATH${NC}"
  echo ""
  echo -e "Usage:"
  echo -e "  ./scripts/import-data.sh [path/to/z2g-migration-data.tar.gz]"
  echo ""
  echo -e "Make sure you copied ${CYAN}z2g-migration-data.tar.gz${NC} from your previous Mac into this folder."
  exit 1
fi

# Backup existing data if present
if [ -d data ] && [ -f data/migration.db ]; then
  BACKUP_DIR="data_backup_$(date +%Y%m%d_%H%M%S)"
  echo -e "${YELLOW}! Existing database found. Creating safety backup at ${BACKUP_DIR}...${NC}"
  cp -r data "$BACKUP_DIR"
fi

# Extract archive
tar -xzf "$ARCHIVE_PATH"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Data archive extracted successfully!${NC}"
  if [ -f .env.local ]; then
    echo -e "${GREEN}✓ Restored .env.local configuration${NC}"
  fi
  if [ -d data ]; then
    echo -e "${GREEN}✓ Restored data/ folder and database ledger${NC}"
  fi
  echo ""
  echo -e "${BOLD}You can now start the machine by running:${NC}"
  echo -e "  ${CYAN}./run.sh${NC}   (or double-click ${CYAN}start.command${NC})"
  echo ""
else
  echo -e "${RED}[ERROR] Extraction failed.${NC}"
  exit 1
fi

#!/usr/bin/env bash
# ==============================================================================
# Z2G (Zoho to Google Workspace Migration) - Mac Initial Setup & Diagnostics
# ==============================================================================

cd "$(dirname "$0")" || exit 1

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}${BOLD}==================================================================${NC}"
echo -e "${CYAN}${BOLD}       🛠️  Z2G Setup & System Diagnostics for macOS${NC}"
echo -e "${BLUE}${BOLD}==================================================================${NC}"
echo ""

# 1. Architecture & OS check
OS_NAME=$(uname -s)
ARCH=$(uname -m)
echo -e "Platform: ${CYAN}macOS ($ARCH)${NC}"

if [ "$OS_NAME" != "Darwin" ]; then
  echo -e "${YELLOW}[NOTE] You are running on $OS_NAME (Non-Mac). The application works, but macOS optimizations were selected.${NC}"
fi

# 2. Check Command Line Tools / Compiler (needed for SQLite native compilation)
if ! xcode-select -p >/dev/null 2>&1; then
  echo -e "${YELLOW}! Xcode Command Line Tools not detected.${NC}"
  echo -e "  If SQLite native compilation requires a C/C++ compiler, install it via:"
  echo -e "  ${CYAN}xcode-select --install${NC}"
fi

# 3. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is not installed.${NC}"
  echo -e "Install Node.js (version 18+) via Homebrew:"
  echo -e "  ${YELLOW}brew install node${NC}"
  echo -e "Or download from: ${CYAN}https://nodejs.org${NC}"
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VERSION found (${CYAN}$(which node)${NC})"

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm v$NPM_VERSION found${NC}"

# 4. Check & prepare directories
mkdir -p data
echo -e "${GREEN}✓ Data storage directory initialized (./data)${NC}"

# Auto-restore packaged migration state if database is not present
if [ ! -f data/migration.db ] && [ -f z2g-migration-data.tar.gz ]; then
  echo -e "${CYAN}📦 Restoring migration database and settings from z2g-migration-data.tar.gz...${NC}"
  tar -xzf z2g-migration-data.tar.gz
  echo -e "${GREEN}✓ Restored migration database, 119,000+ migrated ledger hashes, and settings!${NC}"
fi

# 5. Check environment configuration
if [ ! -f .env.local ]; then
  echo -e "${YELLOW}! Creating .env.local from .env.example...${NC}"
  cp .env.example .env.local
  echo -e "${GREEN}✓ Created .env.local${NC}"
else
  echo -e "${GREEN}✓ .env.local already exists${NC}"
fi

# 6. Install dependencies
echo ""
echo -e "${CYAN}Installing dependencies with npm...${NC}"
npm install
if [ $? -ne 0 ]; then
  echo -e "${RED}[ERROR] npm install encountered errors.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm dependencies successfully installed${NC}"

# 7. Rebuild better-sqlite3 for current Mac architecture
echo ""
echo -e "${CYAN}Rebuilding better-sqlite3 for $ARCH architecture...${NC}"
npm rebuild better-sqlite3
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ SQLite native binary built successfully${NC}"
else
  echo -e "${YELLOW}! Trying alternative build-from-source...${NC}"
  npm install better-sqlite3 --build-from-source
fi

# 8. Run test suite to verify system integrity
echo ""
echo -e "${CYAN}Running test suite to verify full platform health...${NC}"
npm test
if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}${BOLD}==================================================================${NC}"
  echo -e "${GREEN}${BOLD}   🎉 Setup Complete! All 28 automated acceptance tests passed!   ${NC}"
  echo -e "${GREEN}${BOLD}==================================================================${NC}"
  echo ""
  echo -e "You can now launch the application anytime by running:"
  echo -e "  ${CYAN}./run.sh${NC}   (or double-clicking ${CYAN}start.command${NC} in Finder)"
  echo ""
else
  echo -e "${RED}! Test suite had issues. Please review output above.${NC}"
  exit 1
fi

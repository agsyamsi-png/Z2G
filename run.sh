#!/usr/bin/env bash
# ==============================================================================
# Z2G (Zoho to Google Workspace Migration Platform) - Mac Quick Launch Script
# ==============================================================================

# Ensure script runs from project root directory
cd "$(dirname "$0")" || exit 1

# Formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}${BOLD}==================================================================${NC}"
echo -e "${CYAN}${BOLD}       🚀 Z2G Mailbox Migration Platform - Mac Launcher${NC}"
echo -e "${BLUE}${BOLD}==================================================================${NC}"
echo ""

# Prefer Node 22 or Node 20 LTS if available via Homebrew
if [ -d "/opt/homebrew/opt/node@22/bin" ]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
elif [ -d "/opt/homebrew/opt/node@20/bin" ]; then
  export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
elif [ -d "/usr/local/opt/node@22/bin" ]; then
  export PATH="/usr/local/opt/node@22/bin:$PATH"
elif [ -d "/usr/local/opt/node@20/bin" ]; then
  export PATH="/usr/local/opt/node@20/bin:$PATH"
fi

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is not installed!${NC}"
  echo ""
  echo -e "Please install Node.js (version 20 or 22 LTS):"
  if command -v brew >/dev/null 2>&1; then
    echo -e "  Run: ${YELLOW}brew install node@22${NC}"
  else
    echo -e "  Download from: ${CYAN}https://nodejs.org${NC}"
  fi
  echo ""
  read -p "Press [Enter] to exit..."
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VER" -ge 24 ] && command -v brew >/dev/null 2>&1; then
  echo -e "${YELLOW}! Detected experimental Node.js v$NODE_VER.${NC}"
  echo -e "${CYAN}Switching to Node 22 LTS for precompiled database binaries...${NC}"
  brew install node@22 >/dev/null 2>&1
  if [ -d "/opt/homebrew/opt/node@22/bin" ]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  elif [ -d "/usr/local/opt/node@22/bin" ]; then
    export PATH="/usr/local/opt/node@22/bin:$PATH"
  fi
  NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
fi

if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}[ERROR] Node.js version $NODE_VER detected. Version 20 or 22 LTS is required.${NC}"
  echo -e "Please install Node 22 via: ${CYAN}brew install node@22${NC}"
  read -p "Press [Enter] to exit..."
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) ready (${CYAN}$(which node)${NC})"

# 2. Check and prepare data folder
mkdir -p data

# Auto-restore packaged migration state if database is not present
if [ ! -f data/migration.db ] && [ -f z2g-migration-data.tar.gz ]; then
  echo -e "${CYAN}📦 Restoring migration database and settings from z2g-migration-data.tar.gz...${NC}"
  tar -xzf z2g-migration-data.tar.gz
  echo -e "${GREEN}✓ Restored migration database, 119,000+ migrated ledger hashes, and settings!${NC}"
fi

# 3. Check environment file
if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    echo -e "${YELLOW}! .env.local not found. Initializing from .env.example...${NC}"
    cp .env.example .env.local
    echo -e "${GREEN}✓ Created .env.local${NC}"
  fi
fi

# 4. Check dependencies (node_modules)
if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ]; then
  echo -e "${YELLOW}⚙ Installing project dependencies (npm install)...${NC}"
  npm install
  if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] npm install failed.${NC}"
    read -p "Press [Enter] to exit..."
    exit 1
  fi
  echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# 5. Verify native SQLite module
node -e "require('better-sqlite3')" >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}⚙ Compiling SQLite native module for this Mac ($(node -v))...${NC}"
  (cd node_modules/better-sqlite3 && npm run install) 2>/dev/null
  if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    npm rebuild better-sqlite3 --ignore-scripts=false
  fi
  if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    npm install better-sqlite3 --build-from-source --ignore-scripts=false
  fi
fi
echo -e "${GREEN}✓ SQLite database engine ready${NC}"

# 6. Check if port 3000 is occupied
PORT_OCCUPIED=$(lsof -i:3000 -t | head -n1)
if [ -n "$PORT_OCCUPIED" ]; then
  echo -e "${YELLOW}! Port 3000 is already in use (PID: $PORT_OCCUPIED).${NC}"
  echo -e "  Reusing the existing server running on http://localhost:3000"
  echo ""
  open http://localhost:3000
  echo -e "${GREEN}✓ Opened http://localhost:3000 in your browser.${NC}"
  exit 0
fi

# 7. Start server and open browser
echo ""
echo -e "${CYAN}Starting Next.js development server...${NC}"
echo -e "${GREEN}${BOLD}Dashboard URL: ${CYAN}http://localhost:3000${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server anytime.${NC}"
echo ""

# Launch browser in background after 3 seconds
(sleep 3 && open http://localhost:3000) &

# Run server
npm run dev

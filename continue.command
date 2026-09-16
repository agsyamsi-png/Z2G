#!/usr/bin/env bash
# ==============================================================================
# Z2G - ONE-CLICK AUTO-RESUME ENGINE
# Double-click in Finder or run `bash continue.command` to automatically:
# 1. Unpack migration data & database ledger
# 2. Compile native SQLite bindings
# 3. Start Next.js server
# 4. Auto-trigger YOLO mode (6 concurrent workers)
# 5. Open browser & stream live progress in terminal
# ==============================================================================

cd "$(dirname "$0")" || exit 1

# Strip quarantine from itself and project files
if command -v xattr >/dev/null 2>&1; then
  xattr -cr . 2>/dev/null
fi

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "${GREEN}${BOLD}       🔥 Z2G AUTO-RESUME — 1-CLICK MIGRATION ENGINE 🔥${NC}"
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo ""

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is not installed.${NC}"
  echo -e "Please install Node.js from https://nodejs.org or run 'brew install node'"
  read -p "Press [Enter] to exit..."
  exit 1
fi

# 2. Unpack migration database if needed
if [ ! -f data/migration.db ] && [ -f z2g-migration-data.tar.gz ]; then
  echo -e "${CYAN}📦 Unpacking migration database & 119k+ message ledger...${NC}"
  tar -xzf z2g-migration-data.tar.gz
  echo -e "${GREEN}✓ Database & credentials restored successfully!${NC}"
elif [ -f z2g-migration-data.tar.gz ] && [ ! -s data/migration.db ]; then
  echo -e "${CYAN}📦 Restoring database from archive...${NC}"
  tar -xzf z2g-migration-data.tar.gz
fi

# 3. Check node_modules
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}⚙ Installing project dependencies (npm install)...${NC}"
  npm install
fi

# 4. Ensure better-sqlite3 native bindings work
node -e "require('better-sqlite3')" >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}⚙ Compiling SQLite native module for this Mac ($(node -v))...${NC}"
  npm rebuild better-sqlite3
  if [ $? -ne 0 ]; then
    npm install better-sqlite3 --build-from-source
  fi
fi

# 5. Start server if not running
PORT_PID=$(lsof -i:3000 -t 2>/dev/null | head -n1)
if [ -z "$PORT_PID" ]; then
  echo -e "${CYAN}🚀 Starting Z2G migration server in background...${NC}"
  npm run dev > .server.log 2>&1 &
  SERVER_PID=$!
  
  # Wait for server to be responsive
  echo -n "Waiting for server to initialize..."
  for i in {1..40}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
      echo -e " ${GREEN}Ready!${NC}"
      break
    fi
    echo -n "."
    sleep 1
  done
else
  echo -e "${GREEN}✓ Server already active on port 3000 (PID: $PORT_PID)${NC}"
fi

# 6. Auto-trigger YOLO mode
echo ""
echo -e "${YELLOW}⚡ Auto-triggering YOLO bulk migration across remaining mailboxes...${NC}"
sleep 2
TRIGGER_RESP=$(curl -s -X POST http://localhost:3000/api/projects/proj-andhika-master/migrate/bulk -H "Content-Type: application/json" -d '{"action":"yolo"}')

if echo "$TRIGGER_RESP" | grep -q '"success":true'; then
  echo -e "${GREEN}${BOLD}✓ YOLO MODE ACTIVATED! 6 concurrent workers are streaming emails!${NC}"
else
  echo -e "${YELLOW}! Queue response: $TRIGGER_RESP${NC}"
fi

# 7. Open browser
if command -v open >/dev/null 2>&1; then
  echo -e "${CYAN}🌐 Opening dashboard in browser...${NC}"
  open "http://localhost:3000"
fi

# 8. Live Progress Monitor in Terminal
echo ""
echo -e "${CYAN}${BOLD}--------------------------------------------------------------------${NC}"
echo -e "${GREEN}${BOLD}  Watching Live Migration Stream (Press Ctrl+C to close monitor)${NC}"
echo -e "${CYAN}  (The migration will keep running uninterrupted in the background)${NC}"
echo -e "${CYAN}${BOLD}--------------------------------------------------------------------${NC}"
echo ""

while true; do
  STATUS=$(curl -s http://localhost:3000/api/projects/proj-andhika-master/migrate/bulk 2>/dev/null)
  if [ -n "$STATUS" ]; then
    MIGRATED=$(echo "$STATUS" | grep -o '"totalMessagesMigrated":[0-9]*' | cut -d':' -f2)
    INFLIGHT=$(echo "$STATUS" | grep -o '"inFlightCount":[0-9]*' | cut -d':' -f2)
    PENDING=$(echo "$STATUS" | grep -o '"pendingCount":[0-9]*' | cut -d':' -f2)
    COMPLETED=$(echo "$STATUS" | grep -o '"completedCount":[0-9]*' | cut -d':' -f2)
    
    TIMESTAMP=$(date +"%H:%M:%S")
    echo -e "[${TIMESTAMP}] 🚀 Active Workers: ${GREEN}${INFLIGHT:-0}${NC} | Completed: ${GREEN}${COMPLETED:-0}${NC} | Pending: ${YELLOW}${PENDING:-0}${NC} | Total Migrated: ${CYAN}${MIGRATED:-0} msgs${NC}"
  fi
  sleep 5
done

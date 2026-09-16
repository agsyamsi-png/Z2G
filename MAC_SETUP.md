# 🍏 Running Z2G Migration Platform on Another Mac

This guide provides step-by-step instructions to get the **Z2G Mailbox Migration Platform** up and running on any macOS machine (Apple Silicon M1/M2/M3/M4 or Intel).

---

## ⚡ Option A: Quickstart (Fresh Setup on Another Mac)

### Step 1: Ensure Node.js is Installed
The platform requires **Node.js 18 or higher**.
Check if it is installed:
```bash
node -v
```
*If not installed, run with Homebrew:*
```bash
brew install node
```
*Or download directly from [nodejs.org](https://nodejs.org).*

---

### Step 2: Clone the Repository
```bash
git clone https://github.com/agsyamsi-png/Z2G.git
cd Z2G
```

---

### Step 3: Run the Automated Setup
Run the setup script:
```bash
./setup.sh
```
This script automatically:
1. Checks macOS architecture (`arm64` or `x86_64`).
2. Installs dependencies via `npm install`.
3. Compiles the native SQLite engine (`better-sqlite3`) for your Mac.
4. Generates `.env.local` from template.
5. Runs the 28 automated acceptance tests to verify 100% system integrity.

---

### Step 4: Launch the Platform

You have two convenient ways to start:

#### Method 1: Double-Click in Finder (Zero Terminal Commands)
1. Open the `Z2G` folder in macOS **Finder**.
2. Double-click **`start.command`**.
3. It opens Terminal, boots the server, and automatically opens [http://localhost:3000](http://localhost:3000) in Safari or Chrome!

*(If macOS displays an unidentified developer warning on first click, right-click `start.command` and select **Open**).*

#### Method 2: From Terminal
```bash
./run.sh
```

---

## 📦 Option B: Transferring Your Ongoing Migration from This Mac

If you want to continue the **exact same live migration** on another Mac (with all 117,000+ migrated messages, deduplication ledger, Google credentials, and mailbox states preserved):

### On Your Current Mac (Mac 1):
1. In the terminal, run:
   ```bash
   ./scripts/export-data.sh
   ```
2. This creates a file named **`z2g-migration-data.tar.gz`**.
3. Send this file to your other Mac via **AirDrop**, USB flash drive, or secure shared drive.

### On the Target Mac (Mac 2):
1. Clone the repository on Mac 2:
   ```bash
   git clone https://github.com/agsyamsi-png/Z2G.git
   cd Z2G
   ```
2. Move the **`z2g-migration-data.tar.gz`** file into the `Z2G` directory.
3. Import the database and settings:
   ```bash
   ./scripts/import-data.sh
   ```
4. Start the machine:
   ```bash
   ./run.sh
   ```
5. Open [http://localhost:3000/projects/proj-andhika-master](http://localhost:3000/projects/proj-andhika-master). All mailbox progress, completed counts, and the zero-duplicate ledger will be restored and ready to resume!

---

## 🛠️ Useful Commands & Scripts Reference

| Script | Purpose |
| :--- | :--- |
| **`start.command`** | Double-clickable macOS Finder launcher (starts server & opens browser). |
| **`./run.sh`** | Terminal launcher with dependency check and port conflict resolution. |
| **`./setup.sh`** | Full environment setup, native binary compilation, and test suite verification. |
| **`./scripts/export-data.sh`** | Packages `data/` and `.env.local` for AirDrop / transfer to another Mac. |
| **`./scripts/import-data.sh`** | Restores packaged migration data and credentials on the target Mac. |
| **`npm test`** | Executes all 28 automated acceptance tests with Vitest. |

---

## 💡 Troubleshooting on macOS

### 1. "Permission Denied" when running scripts
If you cloned without executable flags, run:
```bash
chmod +x *.sh start.command scripts/*.sh
```

### 2. Native SQLite architecture mismatch (`better-sqlite3`)
If you transferred `node_modules` between an Intel Mac and Apple Silicon Mac, run:
```bash
npm rebuild better-sqlite3
```
or run `./setup.sh`, which rebuilds it automatically.

### 3. Port 3000 is occupied
`./run.sh` automatically checks if port 3000 is active and re-opens the browser to the existing instance. If you need to stop an old server, run:
```bash
kill $(lsof -t -i:3000)
```

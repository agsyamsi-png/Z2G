const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

// 1. Check and auto-restore migration database if missing
const dbPath = path.join(rootDir, 'data', 'migration.db');
const tarPath = path.join(rootDir, 'z2g-migration-data.tar.gz');

if (!fs.existsSync(dbPath) && fs.existsSync(tarPath)) {
  console.log('\x1b[36m📦 Restoring migration database and settings from z2g-migration-data.tar.gz...\x1b[0m');
  try {
    execSync('tar -xzf z2g-migration-data.tar.gz', { cwd: rootDir, stdio: 'inherit' });
    console.log('\x1b[32m✓ Restored 119,000+ message deduplication ledger and database!\x1b[0m');
  } catch (err) {
    console.warn('\x1b[33m! Warning: Failed to auto-extract z2g-migration-data.tar.gz:\x1b[0m', err.message);
  }
}

// 2. Test better-sqlite3 native bindings
let sqliteOk = false;
try {
  require('better-sqlite3');
  sqliteOk = true;
} catch (err) {
  // bindings missing or ABI mismatch
}

if (sqliteOk) {
  // All good!
  process.exit(0);
}

console.log('\x1b[33m⚙ SQLite native bindings missing for Node ' + process.version + ' (' + process.arch + '). Auto-installing prebuilt binary...\x1b[0m');

const sqliteDir = path.join(rootDir, 'node_modules', 'better-sqlite3');
if (fs.existsSync(sqliteDir)) {
  try {
    // Attempt 1: Direct prebuild-install
    execSync('npx --yes prebuild-install', { cwd: sqliteDir, stdio: 'inherit' });
  } catch (e1) {
    try {
      // Attempt 2: npm run install inside module
      execSync('npm run install', { cwd: sqliteDir, stdio: 'inherit' });
    } catch (e2) {
      try {
        // Attempt 3: rebuild with scripts unblocked
        execSync('npm rebuild better-sqlite3 --ignore-scripts=false', { cwd: rootDir, stdio: 'inherit' });
      } catch (e3) {
        // Will be verified below
      }
    }
  }
}

// 3. Final verification
try {
  require('better-sqlite3');
  console.log('\x1b[32m✓ SQLite database engine successfully ready!\x1b[0m');
  process.exit(0);
} catch (finalErr) {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  console.error('\x1b[31m[ERROR] Failed to load SQLite engine for Node ' + process.version + '\x1b[0m');
  if (major >= 24) {
    console.error('\x1b[33mNode.js v' + major + ' has breaking V8 C++ API changes. Please run on Node 22 LTS:\x1b[0m');
    console.error('\x1b[36m  brew install node@22 && brew link --overwrite --force node@22\x1b[0m\n');
  } else {
    console.error(finalErr.message);
  }
  process.exit(1);
}
